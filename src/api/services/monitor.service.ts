import { execSync } from 'child_process';
import EventEmitter2 from 'eventemitter2';
import { existsSync, mkdirSync, opendirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { Db } from 'mongodb';
import { Collection } from 'mongoose';
import { join } from 'path';

import {
  Auth,
  CacheConf,
  ConfigService,
  Database,
  DelInstance,
  HttpServer,
  ProviderSession,
} from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { INSTANCE_DIR, STORE_DIR } from '../../config/path.config';
import { NotFoundException } from '../../exceptions';
import {
  AuthModel,
  ChamaaiModel,
  ChatwootModel,
  ContactModel,
  LabelModel,
  ProxyModel,
  RabbitmqModel,
  SettingsModel,
  TypebotModel,
  WebhookModel,
  WebsocketModel,
} from '../models';
import { ProviderFiles } from '../provider/sessions';
import { RepositoryBroker } from '../repository/repository.manager';
import { Integration } from '../types/wa.types';
import { CacheService } from './cache.service';
import { BaileysStartupService } from './channels/whatsapp.baileys.service';
import { BusinessStartupService } from './channels/whatsapp.business.service';

export class WAMonitoringService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly repository: RepositoryBroker,
    private readonly cache: CacheService,
    private readonly chatwootCache: CacheService,
    private readonly baileysCache: CacheService,
    private readonly providerFiles: ProviderFiles,
  ) {
    this.logger.verbose('instance created');

    this.removeInstance();
    this.noConnection();

    Object.assign(this.db, configService.get<Database>('DATABASE'));
    Object.assign(this.redis, configService.get<CacheConf>('CACHE'));

    this.dbInstance = this.db.ENABLED
      ? this.repository.dbServer?.db(this.db.CONNECTION.DB_PREFIX_NAME + '-instances')
      : undefined;
  }

  private readonly db: Partial<Database> = {};
  private readonly redis: Partial<CacheConf> = {};

  private dbInstance: Db;

  private readonly logger = new Logger(WAMonitoringService.name);
  public readonly waInstances: Record<string, BaileysStartupService | BusinessStartupService> = {};

  private readonly providerSession = Object.freeze(this.configService.get<ProviderSession>('PROVIDER'));

  public delInstanceTime(instance: string) {
    const time = this.configService.get<DelInstance>('DEL_INSTANCE');
    if (typeof time === 'number' && time > 0) {
      this.logger.verbose(`Instance "${instance}" don't have connection, will be removed in ${time} minutes`);

      setTimeout(async () => {
        if (this.waInstances[instance]?.connectionStatus?.state !== 'open') {
          if (this.waInstances[instance]?.connectionStatus?.state === 'connecting') {
            if ((await this.waInstances[instance].findIntegration()).integration === Integration.WHATSAPP_BAILEYS) {
              await this.waInstances[instance]?.client?.logout('Log out instance: ' + instance);
              this.waInstances[instance]?.client?.ws?.close();
              this.waInstances[instance]?.client?.end(undefined);
            }
            this.waInstances[instance]?.removeRabbitmqQueues();
            delete this.waInstances[instance];
          } else {
            this.waInstances[instance]?.removeRabbitmqQueues();
            delete this.waInstances[instance];
            this.eventEmitter.emit('remove.instance', instance, 'inner');
          }
        }
      }, 1000 * 60 * time);
    }
  }

  public async instanceInfo(instanceName?: string, arrayReturn = false) {
    this.logger.verbose('get instance info');
    if (instanceName && !this.waInstances[instanceName]) {
      throw new NotFoundException(`Instance "${instanceName}" not found`);
    }

    const instances: any[] = [];

    for await (const [key, value] of Object.entries(this.waInstances)) {
      if (value) {
        this.logger.verbose('get instance info: ' + key);
        let chatwoot: any;

        const urlServer = this.configService.get<HttpServer>('SERVER').URL;

        const findChatwoot = await this.waInstances[key].findChatwoot();

        if (findChatwoot && findChatwoot.enabled) {
          chatwoot = {
            ...findChatwoot,
            webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(key)}`,
          };
        }

        const findIntegration = await this.waInstances[key].findIntegration();

        let integration: any;
        if (findIntegration) {
          integration = {
            ...findIntegration,
            webhook_wa_business: `${urlServer}/webhook/whatsapp/${encodeURIComponent(key)}`,
          };
        }

        if (value.connectionStatus.state === 'open') {
          this.logger.verbose('instance: ' + key + ' - connectionStatus: open');

          const instanceData = {
            instance: {
              instanceName: key,
              instanceId: (await this.repository.auth.find(key))?.instanceId,
              owner: value.wuid,
              profileName: (await value.getProfileName()) || 'not loaded',
              profilePictureUrl: value.profilePictureUrl,
              profileStatus: (await value.getProfileStatus()) || '',
              status: value.connectionStatus.state,
            },
          };

          if (this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES) {
            instanceData.instance['serverUrl'] = this.configService.get<HttpServer>('SERVER').URL;

            instanceData.instance['apikey'] = (await this.repository.auth.find(key))?.apikey;

            instanceData.instance['chatwoot'] = chatwoot;

            instanceData.instance['integration'] = integration;
          }

          instances.push(instanceData);
        } else {
          this.logger.verbose('instance: ' + key + ' - connectionStatus: ' + value.connectionStatus.state);

          const instanceData = {
            instance: {
              instanceName: key,
              instanceId: (await this.repository.auth.find(key))?.instanceId,
              status: value.connectionStatus.state,
            },
          };

          if (this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES) {
            instanceData.instance['serverUrl'] = this.configService.get<HttpServer>('SERVER').URL;

            instanceData.instance['apikey'] = (await this.repository.auth.find(key))?.apikey;

            instanceData.instance['chatwoot'] = chatwoot;

            instanceData.instance['integration'] = integration;
          }

          instances.push(instanceData);
        }
      }
    }

    this.logger.verbose('return instance info: ' + instances.length);

    if (arrayReturn) {
      return [instances.find((i) => i.instance.instanceName === instanceName) ?? instances];
    }
    return instances.find((i) => i.instance.instanceName === instanceName) ?? instances;
  }

  public async instanceInfoById(instanceId?: string, number?: string) {
    this.logger.verbose('get instance info');
    let instanceName: string;
    if (instanceId) {
      instanceName = await this.repository.auth.findInstanceNameById(instanceId);
      if (!instanceName) {
        throw new NotFoundException(`Instance "${instanceId}" not found`);
      }
    } else if (number) {
      instanceName = await this.repository.auth.findInstanceNameByNumber(number);
      if (!instanceName) {
        throw new NotFoundException(`Instance "${number}" not found`);
      }
    }

    if (!instanceName) {
      throw new NotFoundException(`Instance "${instanceId}" not found`);
    }

    if (instanceName && !this.waInstances[instanceName]) {
      throw new NotFoundException(`Instance "${instanceName}" not found`);
    }

    return this.instanceInfo(instanceName);
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
      } else if (!this.redis.REDIS.ENABLED && !this.redis.REDIS.SAVE_INSTANCES) {
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

    if (this.redis.REDIS.ENABLED && this.redis.REDIS.SAVE_INSTANCES) {
      this.logger.verbose('cleaning up instance in redis: ' + instanceName);
      await this.cache.delete(instanceName);
      return;
    }

    this.logger.verbose('cleaning up instance in files: ' + instanceName);
    if (this.providerSession?.ENABLED) {
      await this.providerFiles.removeSession(instanceName);
    }
    rmSync(join(INSTANCE_DIR, instanceName), { recursive: true, force: true });
  }

  public async cleaningStoreFiles(instanceName: string) {
    if (!this.db.ENABLED) {
      this.logger.verbose('cleaning store files instance: ' + instanceName);
      if (this.providerSession?.ENABLED) {
        await this.providerFiles.removeSession(instanceName);
      }
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
      execSync(`rm -rf ${join(STORE_DIR, 'labels', instanceName + '*')}`);

      return;
    }

    this.logger.verbose('cleaning store database instance: ' + instanceName);

    await AuthModel.deleteMany({ _id: instanceName });
    await WebhookModel.deleteMany({ _id: instanceName });
    await ChatwootModel.deleteMany({ _id: instanceName });
    await ChamaaiModel.deleteMany({ _id: instanceName });
    await ProxyModel.deleteMany({ _id: instanceName });
    await RabbitmqModel.deleteMany({ _id: instanceName });
    await TypebotModel.deleteMany({ _id: instanceName });
    await WebsocketModel.deleteMany({ _id: instanceName });
    await SettingsModel.deleteMany({ _id: instanceName });
    await LabelModel.deleteMany({ owner: instanceName });
    await ContactModel.deleteMany({ owner: instanceName });

    return;
  }

  public async loadInstance() {
    this.logger.verbose('Loading instances');

    try {
      if (this.providerSession?.ENABLED) {
        await this.loadInstancesFromProvider();
      } else if (this.redis.REDIS.ENABLED && this.redis.REDIS.SAVE_INSTANCES) {
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

  public async saveInstance(data: any) {
    this.logger.verbose('Save instance');

    try {
      const msgParsed = JSON.parse(JSON.stringify(data));
      if (this.db.ENABLED && this.db.SAVE_DATA.INSTANCE) {
        await this.repository.dbServer.connect();
        await this.dbInstance.collection(data.instanceName).replaceOne({ _id: 'integration' }, msgParsed, {
          upsert: true,
        });
      } else {
        const path = join(INSTANCE_DIR, data.instanceName);
        if (!existsSync(path)) mkdirSync(path, { recursive: true });
        writeFileSync(path + '/integration.json', JSON.stringify(msgParsed));
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  private async setInstance(name: string) {
    const integration = await this.repository.integration.find(name);

    let instance: BaileysStartupService | BusinessStartupService;
    if (integration && integration.integration === Integration.WHATSAPP_BUSINESS) {
      instance = new BusinessStartupService(
        this.configService,
        this.eventEmitter,
        this.repository,
        this.cache,
        this.chatwootCache,
        this.baileysCache,
        this.providerFiles,
      );

      instance.instanceName = name;
    } else {
      instance = new BaileysStartupService(
        this.configService,
        this.eventEmitter,
        this.repository,
        this.cache,
        this.chatwootCache,
        this.baileysCache,
        this.providerFiles,
      );

      instance.instanceName = name;

      if (!integration) {
        await instance.setIntegration({ integration: Integration.WHATSAPP_BAILEYS });
      }
    }

    this.logger.verbose('Instance loaded: ' + name);
    await instance.connectToWhatsapp();
    this.logger.verbose('connectToWhatsapp: ' + name);

    this.waInstances[name] = instance;
  }

  private async loadInstancesFromRedis() {
    this.logger.verbose('Redis enabled');
    const keys = await this.cache.keys();

    if (keys?.length > 0) {
      this.logger.verbose('Reading instance keys and setting instances');
      await Promise.all(keys.map((k) => this.setInstance(k.split(':')[2])));
    } else {
      this.logger.verbose('No instance keys found');
    }
  }

  private async loadInstancesFromDatabase() {
    this.logger.verbose('Database enabled');
    await this.repository.dbServer.connect();
    const collections: any[] = await this.dbInstance.collections();
    await this.deleteTempInstances(collections);
    if (collections.length > 0) {
      this.logger.verbose('Reading collections and setting instances');
      await Promise.all(collections.map((coll) => this.setInstance(coll.namespace.replace(/^[\w-]+\./, ''))));
    } else {
      this.logger.verbose('No collections found');
    }
  }

  private async loadInstancesFromProvider() {
    this.logger.verbose('Provider in files enabled');
    const [instances] = await this.providerFiles.allInstances();

    if (!instances?.data) {
      this.logger.verbose('No instances found');
      return;
    }

    await Promise.all(instances?.data?.map(async (instanceName: string) => this.setInstance(instanceName)));
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
        this.waInstances[instanceName]?.clearCacheChatwoot();
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

  private async deleteTempInstances(collections: Collection<Document>[]) {
    const shouldDelete = this.configService.get<boolean>('DEL_TEMP_INSTANCES');
    if (!shouldDelete) {
      this.logger.verbose('Temp instances deletion is disabled');
      return;
    }
    this.logger.verbose('Cleaning up temp instances');
    const auths = await this.repository.auth.list();
    if (auths.length === 0) {
      this.logger.verbose('No temp instances found');
      return;
    }
    let tempInstances = 0;
    auths.forEach((auth) => {
      if (collections.find((coll) => coll.namespace.replace(/^[\w-]+\./, '') === auth._id)) {
        return;
      }
      tempInstances++;
      this.eventEmitter.emit('remove.instance', auth._id, 'inner');
    });
    this.logger.verbose('Temp instances removed: ' + tempInstances);
  }
}
