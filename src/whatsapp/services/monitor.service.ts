import { execSync } from 'child_process';
import EventEmitter2 from 'eventemitter2';
import { opendirSync, readdirSync, rmSync } from 'fs';
import { Db } from 'mongodb';
import { join } from 'path';

import { Auth, ConfigService, Database, DelInstance, HttpServer, Redis } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { INSTANCE_DIR, STORE_DIR } from '../../config/path.config';
import { dbserver } from '../../libs/db.connect';
import { RedisCache } from '../../libs/redis.client';
import {
  AuthModel,
  ChatwootModel,
  ContactModel,
  MessageModel,
  MessageUpModel,
  SettingsModel,
  WebhookModel,
} from '../models';
import { RepositoryBroker } from '../repository/repository.manager';
import { WAStartupService } from './whatsapp.service';

export class WAMonitoringService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly repository: RepositoryBroker,
    private readonly cache: RedisCache,
  ) {
    this.logger.verbose('instance created');

    this.removeInstance();
    this.noConnection();
    this.delInstanceFiles();

    Object.assign(this.db, configService.get<Database>('DATABASE'));
    Object.assign(this.redis, configService.get<Redis>('REDIS'));

    this.dbInstance = this.db.ENABLED
      ? this.repository.dbServer?.db(this.db.CONNECTION.DB_PREFIX_NAME + '-instances')
      : undefined;
  }

  private readonly db: Partial<Database> = {};
  private readonly redis: Partial<Redis> = {};

  private dbInstance: Db;

  private dbStore = dbserver;

  private readonly logger = new Logger(WAMonitoringService.name);
  public readonly waInstances: Record<string, WAStartupService> = {};

  public delInstanceTime(instance: string) {
    const time = this.configService.get<DelInstance>('DEL_INSTANCE');
    if (typeof time === 'number' && time > 0) {
      this.logger.verbose(`Instance "${instance}" don't have connection, will be removed in ${time} minutes`);

      setTimeout(async () => {
        if (this.waInstances[instance]?.connectionStatus?.state !== 'open') {
          if (this.waInstances[instance]?.connectionStatus?.state === 'connecting') {
            await this.waInstances[instance]?.client?.logout('Log out instance: ' + instance);
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
    this.logger.verbose('get instance info');

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;

    const instances: any[] = await Promise.all(
      Object.entries(this.waInstances).map(async ([key, value]) => {
        const status = value?.connectionStatus?.state || 'unknown';

        if (status === 'unknown') {
          return null;
        }

        if (status === 'open') {
          this.logger.verbose('instance: ' + key + ' - connectionStatus: open');
        }

        const instanceData: any = {
          instance: {
            instanceName: key,
            owner: value.wuid,
            profileName: (await value.getProfileName()) || 'not loaded',
            profilePictureUrl: value.profilePictureUrl,
            profileStatus: (await value.getProfileStatus()) || '',
            status: status,
          },
        };

        if (this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES) {
          instanceData.instance.serverUrl = urlServer;
          instanceData.instance.apikey = (await this.repository.auth.find(key))?.apikey;

          const findChatwoot = await this.waInstances[key].findChatwoot();
          if (findChatwoot && findChatwoot.enabled) {
            instanceData.instance.chatwoot = {
              ...findChatwoot,
              webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(key)}`,
            };
          }
        }

        return instanceData;
      }),
    ).then((results) => results.filter((instance) => instance !== null));

    this.logger.verbose('return instance info: ' + instances.length);

    if (instanceName) {
      const instance = instances.find((i) => i.instance.instanceName === instanceName);
      return instance || [];
    }

    return instances;
  }

  private delInstanceFiles() {
    this.logger.verbose('cron to delete instance files started');
    setInterval(async () => {
      if (this.db.ENABLED && this.db.SAVE_DATA.INSTANCE) {
        const collections = await this.dbInstance.collections();
        collections.forEach(async (collection) => {
          const name = collection.namespace.replace(/^[\w-]+./, '');
          await this.dbInstance.collection(name).deleteMany({
            $or: [{ _id: { $regex: /^app.state.*/ } }, { _id: { $regex: /^session-.*/ } }],
          });
          this.logger.verbose('instance files deleted: ' + name);
        });
      } else if (!this.redis.ENABLED) {
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
            this.logger.verbose('instance files deleted: ' + dirent.name);
          }
        }
      }
    }, 3600 * 1000 * 2);
  }

  public async cleaningUp(instanceName: string) {
    this.logger.verbose('cleaning up instance: ' + instanceName);
    if (this.db.ENABLED && this.db.SAVE_DATA.INSTANCE) {
      this.logger.verbose('cleaning up instance in database: ' + instanceName);
      await this.repository.dbServer.connect();
      const collections: any[] = await this.dbInstance.collections();
      if (collections.length > 0) {
        await this.dbInstance.dropCollection(instanceName);
      }
      return;
    }

    if (this.redis.ENABLED) {
      this.logger.verbose('cleaning up instance in redis: ' + instanceName);
      this.cache.reference = instanceName;
      await this.cache.delAll();
      return;
    }

    this.logger.verbose('cleaning up instance in files: ' + instanceName);
    rmSync(join(INSTANCE_DIR, instanceName), { recursive: true, force: true });
  }

  public async cleaningStoreFiles(instanceName: string) {
    if (!this.db.ENABLED) {
      this.logger.verbose('cleaning store files instance: ' + instanceName);
      rmSync(join(INSTANCE_DIR, instanceName), { recursive: true, force: true });

      execSync(`rm -rf ${join(STORE_DIR, 'chats', instanceName)}`);
      execSync(`rm -rf ${join(STORE_DIR, 'contacts', instanceName)}`);
      execSync(`rm -rf ${join(STORE_DIR, 'message-up', instanceName)}`);
      execSync(`rm -rf ${join(STORE_DIR, 'messages', instanceName)}`);

      execSync(`rm -rf ${join(STORE_DIR, 'auth', 'apikey', instanceName + '.json')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'webhook', instanceName + '.json')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'chatwoot', instanceName + '*')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'chamaai', instanceName + '*')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'proxy', instanceName + '*')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'rabbitmq', instanceName + '*')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'typebot', instanceName + '*')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'websocket', instanceName + '*')}`);
      execSync(`rm -rf ${join(STORE_DIR, 'settings', instanceName + '*')}`);

      return;
    }

    this.logger.verbose('cleaning store database instance: ' + instanceName);

    await AuthModel.deleteMany({ owner: instanceName });
    await ContactModel.deleteMany({ owner: instanceName });
    await MessageModel.deleteMany({ owner: instanceName });
    await MessageUpModel.deleteMany({ owner: instanceName });
    await AuthModel.deleteMany({ _id: instanceName });
    await WebhookModel.deleteMany({ _id: instanceName });
    await ChatwootModel.deleteMany({ _id: instanceName });
    await SettingsModel.deleteMany({ _id: instanceName });

    return;
  }

  public async loadInstance() {
    this.logger.verbose('Loading instances');

    try {
      if (this.redis.ENABLED) {
        await this.loadInstancesFromRedis();
      } else if (this.db.ENABLED && this.db.SAVE_DATA.INSTANCE) {
        await this.loadInstancesFromDatabase();
      } else {
        await this.loadInstancesFromFiles();
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  private async setInstance(name: string) {
    const instance = new WAStartupService(this.configService, this.eventEmitter, this.repository, this.cache);
    instance.instanceName = name;
    this.logger.verbose('Instance loaded: ' + name);

    await instance.connectToWhatsapp();
    this.logger.verbose('connectToWhatsapp: ' + name);

    this.waInstances[name] = instance;
  }

  private async loadInstancesFromRedis() {
    this.logger.verbose('Redis enabled');
    await this.cache.connect(this.redis as Redis);
    const keys = await this.cache.instanceKeys();

    if (keys?.length > 0) {
      this.logger.verbose('Reading instance keys and setting instances');
      await Promise.all(keys.map((k) => this.setInstance(k.split(':')[1])));
    } else {
      this.logger.verbose('No instance keys found');
    }
  }

  private async loadInstancesFromDatabase() {
    this.logger.verbose('Database enabled');
    await this.repository.dbServer.connect();
    const collections: any[] = await this.dbInstance.collections();

    if (collections.length > 0) {
      this.logger.verbose('Reading collections and setting instances');
      await Promise.all(collections.map((coll) => this.setInstance(coll.namespace.replace(/^[\w-]+\./, ''))));
    } else {
      this.logger.verbose('No collections found');
    }
  }

  private async loadInstancesFromFiles() {
    this.logger.verbose('Store in files enabled');
    const dir = opendirSync(INSTANCE_DIR, { encoding: 'utf-8' });
    const instanceDirs = [];

    for await (const dirent of dir) {
      if (dirent.isDirectory()) {
        instanceDirs.push(dirent.name);
      } else {
        this.logger.verbose('No instance files found');
      }
    }

    await Promise.all(
      instanceDirs.map(async (instanceName) => {
        this.logger.verbose('Reading instance files and setting instances: ' + instanceName);
        const files = readdirSync(join(INSTANCE_DIR, instanceName), { encoding: 'utf-8' });

        if (files.length === 0) {
          rmSync(join(INSTANCE_DIR, instanceName), { recursive: true, force: true });
        } else {
          await this.setInstance(instanceName);
        }
      }),
    );
  }

  private removeInstance() {
    this.eventEmitter.on('remove.instance', async (instanceName: string) => {
      this.logger.verbose('remove instance: ' + instanceName);
      try {
        this.logger.verbose('instance: ' + instanceName + ' - removing from memory');
        this.waInstances[instanceName] = undefined;
      } catch (error) {
        this.logger.error(error);
      }

      try {
        this.logger.verbose('request cleaning up instance: ' + instanceName);
        this.cleaningUp(instanceName);
        this.cleaningStoreFiles(instanceName);
      } finally {
        this.logger.warn(`Instance "${instanceName}" - REMOVED`);
      }
    });
    this.eventEmitter.on('logout.instance', async (instanceName: string) => {
      this.logger.verbose('logout instance: ' + instanceName);
      try {
        this.logger.verbose('request cleaning up instance: ' + instanceName);
        this.cleaningUp(instanceName);
      } finally {
        this.logger.warn(`Instance "${instanceName}" - LOGOUT`);
      }
    });
  }

  private noConnection() {
    this.logger.verbose('checking instances without connection');
    this.eventEmitter.on('no.connection', async (instanceName) => {
      try {
        this.logger.verbose('logging out instance: ' + instanceName);
        await this.waInstances[instanceName]?.client?.logout('Log out instance: ' + instanceName);

        this.logger.verbose('close connection instance: ' + instanceName);
        this.waInstances[instanceName]?.client?.ws?.close();

        this.waInstances[instanceName].instance.qrcode = { count: 0 };
        this.waInstances[instanceName].stateConnection.state = 'close';
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
