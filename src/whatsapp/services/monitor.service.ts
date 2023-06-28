import { opendirSync, readdirSync, rmSync } from 'fs';
import { WAStartupService } from './whatsapp.service';
import { INSTANCE_DIR } from '../../config/path.config';
import EventEmitter2 from 'eventemitter2';
import { join } from 'path';
import { Logger } from '../../config/logger.config';
import {
  Auth,
  ConfigService,
  Database,
  DelInstance,
  Redis,
} from '../../config/env.config';
import { RepositoryBroker } from '../repository/repository.manager';
import { NotFoundException } from '../../exceptions';
import { Db } from 'mongodb';
import { RedisCache } from '../../db/redis.client';
import { initInstance } from '../whatsapp.module';

export class WAMonitoringService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly repository: RepositoryBroker,
  ) {
    this.removeInstance();
    this.noConnection();
    this.delInstanceFiles();

    Object.assign(this.db, configService.get<Database>('DATABASE'));
    Object.assign(this.redis, configService.get<Redis>('REDIS'));

    this.dbInstance = this.db.ENABLED
      ? this.repository.dbServer?.db(this.db.CONNECTION.DB_PREFIX_NAME + '-instances')
      : undefined;

    this.redisCache = this.redis.ENABLED ? new RedisCache(this.redis) : undefined;
  }

  private readonly db: Partial<Database> = {};
  private readonly redis: Partial<Redis> = {};

  private dbInstance: Db;
  private redisCache: RedisCache;

  private readonly logger = new Logger(WAMonitoringService.name);
  public readonly waInstances: Record<string, WAStartupService> = {};

  public delInstanceTime(instance: string) {
    const time = this.configService.get<DelInstance>('DEL_INSTANCE');
    if (typeof time === 'number' && time > 0) {
      setTimeout(async () => {
        if (this.waInstances[instance]?.connectionStatus?.state !== 'open') {
          if (this.waInstances[instance]?.connectionStatus?.state === 'connecting') {
            await this.waInstances[instance]?.client?.logout(
              'Log out instance: ' + instance,
            );
            this.waInstances[instance]?.client?.ws?.close();
            this.waInstances[instance]?.client?.end(undefined);
            delete this.waInstances[instance];
          } else {
            delete this.waInstances[instance];
            this.eventEmitter.emit('remove.instance', instance, 'inner');
          }
        }
      }, 1000 * 60 * time);
    }
  }

  public async instanceInfo(instanceName?: string) {
    if (instanceName && !this.waInstances[instanceName]) {
      throw new NotFoundException(`Instance "${instanceName}" not found`);
    }

    const instances: any[] = [];

    for await (const [key, value] of Object.entries(this.waInstances)) {
      if (value) {
        if (value.connectionStatus.state === 'open') {
          let apikey: string;
          if (this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES) {
            const tokenStore = await this.repository.auth.find(key);
            apikey = tokenStore.apikey || 'Apikey not found';

            instances.push({
              instance: {
                instanceName: key,
                owner: value.wuid,
                profileName: (await value.getProfileName()) || 'not loaded',
                profilePictureUrl: value.profilePictureUrl,
                status: (await value.getProfileStatus()) || '',
                apikey,
              },
            });
          } else {
            instances.push({
              instance: {
                instanceName: key,
                owner: value.wuid,
                profileName: (await value.getProfileName()) || 'not loaded',
                profilePictureUrl: value.profilePictureUrl,
                status: (await value.getProfileStatus()) || '',
              },
            });
          }
        } else {
          let apikey: string;
          if (this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES) {
            const tokenStore = await this.repository.auth.find(key);
            apikey = tokenStore.apikey || 'Apikey not found';

            instances.push({
              instance: {
                instanceName: key,
                status: value.connectionStatus.state,
                apikey,
              },
            });
          } else {
            instances.push({
              instance: {
                instanceName: key,
                status: value.connectionStatus.state,
              },
            });
          }
        }
      }
    }

    return instances.find((i) => i.instance.instanceName === instanceName) ?? instances;
  }

  private delInstanceFiles() {
    setInterval(async () => {
      if (this.db.ENABLED && this.db.SAVE_DATA.INSTANCE) {
        const collections = await this.dbInstance.collections();
        collections.forEach(async (collection) => {
          const name = collection.namespace.replace(/^[\w-]+./, '');
          await this.dbInstance.collection(name).deleteMany({
            $or: [
              { _id: { $regex: /^app.state.*/ } },
              { _id: { $regex: /^session-.*/ } },
            ],
          });
        });
      } else {
        const dir = opendirSync(INSTANCE_DIR, { encoding: 'utf-8' });
        for await (const dirent of dir) {
          if (dirent.isDirectory()) {
            const files = readdirSync(join(INSTANCE_DIR, dirent.name), {
              encoding: 'utf-8',
            });
            files.forEach(async (file) => {
              if (file.match(/^app.state.*/) || file.match(/^session-.*/)) {
                rmSync(join(INSTANCE_DIR, dirent.name, file), {
                  recursive: true,
                  force: true,
                });
              }
            });
          }
        }
      }
    }, 3600 * 1000 * 2);
  }

  public async cleaningUp(instanceName: string) {
    if (this.db.ENABLED && this.db.SAVE_DATA.INSTANCE) {
      await this.repository.dbServer.connect();
      const collections: any[] = await this.dbInstance.collections();
      if (collections.length > 0) {
        await this.dbInstance.dropCollection(instanceName);
      }
      return;
    }

    if (this.redis.ENABLED) {
      this.redisCache.reference = instanceName;
      await this.redisCache.delAll();
      return;
    }
    rmSync(join(INSTANCE_DIR, instanceName), { recursive: true, force: true });
  }

  public async loadInstance() {
    const set = async (name: string) => {
      const instance = new WAStartupService(
        this.configService,
        this.eventEmitter,
        this.repository,
      );
      instance.instanceName = name;
      await instance.connectToWhatsapp();
      this.waInstances[name] = instance;
    };

    try {
      if (this.redis.ENABLED) {
        const keys = await this.redisCache.instanceKeys();
        if (keys?.length > 0) {
          keys.forEach(async (k) => await set(k.split(':')[1]));
        } else {
          initInstance();
        }
        return;
      }

      if (this.db.ENABLED && this.db.SAVE_DATA.INSTANCE) {
        await this.repository.dbServer.connect();
        const collections: any[] = await this.dbInstance.collections();
        if (collections.length > 0) {
          collections.forEach(
            async (coll) => await set(coll.namespace.replace(/^[\w-]+\./, '')),
          );
        } else {
          initInstance();
        }
        return;
      }

      const dir = opendirSync(INSTANCE_DIR, { encoding: 'utf-8' });
      for await (const dirent of dir) {
        if (dirent.isDirectory()) {
          const files = readdirSync(join(INSTANCE_DIR, dirent.name), {
            encoding: 'utf-8',
          });
          if (files.length === 0) {
            rmSync(join(INSTANCE_DIR, dirent.name), { recursive: true, force: true });
            break;
          }

          await set(dirent.name);
        } else {
          initInstance();
        }
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  private removeInstance() {
    this.eventEmitter.on('remove.instance', async (instanceName: string) => {
      try {
        this.waInstances[instanceName] = undefined;
      } catch {}

      try {
        this.cleaningUp(instanceName);
      } finally {
        this.logger.warn(`Instance "${instanceName}" - REMOVED`);
      }
    });
  }

  private noConnection() {
    this.eventEmitter.on('no.connection', async (instanceName) => {
      try {
        this.waInstances[instanceName] = undefined;
        this.cleaningUp(instanceName);
      } catch (error) {
        this.logger.error({
          localError: 'noConnection',
          warn: 'Error deleting instance from memory.',
          error,
        });
      } finally {
        this.logger.warn(`Instance "${instanceName}" - NOT CONNECTION`);
      }
    });
  }
}
