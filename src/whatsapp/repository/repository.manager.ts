import fs from 'fs';
import { MongoClient } from 'mongodb';
import { join } from 'path';

import { Auth, ConfigService, Database } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { AuthRepository } from './auth.repository';
import { ChatRepository } from './chat.repository';
import { ChatwootRepository } from './chatwoot.repository';
import { ContactRepository } from './contact.repository';
import { MessageRepository } from './message.repository';
import { MessageUpRepository } from './messageUp.repository';
import { ProxyRepository } from './proxy.repository';
import { RabbitmqRepository } from './rabbitmq.repository';
import { SettingsRepository } from './settings.repository';
import { TypebotRepository } from './typebot.repository';
import { WebhookRepository } from './webhook.repository';
import { WebsocketRepository } from './websocket.repository';
export class RepositoryBroker {
  constructor(
    public readonly message: MessageRepository,
    public readonly chat: ChatRepository,
    public readonly contact: ContactRepository,
    public readonly messageUpdate: MessageUpRepository,
    public readonly webhook: WebhookRepository,
    public readonly chatwoot: ChatwootRepository,
    public readonly settings: SettingsRepository,
    public readonly websocket: WebsocketRepository,
    public readonly rabbitmq: RabbitmqRepository,
    public readonly typebot: TypebotRepository,
    public readonly proxy: ProxyRepository,
    public readonly auth: AuthRepository,
    private configService: ConfigService,
    dbServer?: MongoClient,
  ) {
    this.dbClient = dbServer;
    this.__init_repo_without_db__();
  }

  private dbClient?: MongoClient;
  private readonly logger = new Logger('RepositoryBroker');

  public get dbServer() {
    return this.dbClient;
  }

  private __init_repo_without_db__() {
    this.logger.verbose('initializing repository without db');
    if (!this.configService.get<Database>('DATABASE').ENABLED) {
      const storePath = join(process.cwd(), 'store');

      this.logger.verbose('creating store path: ' + storePath);
      try {
        const authDir = join(storePath, 'auth', this.configService.get<Auth>('AUTHENTICATION').TYPE);
        const chatsDir = join(storePath, 'chats');
        const contactsDir = join(storePath, 'contacts');
        const messagesDir = join(storePath, 'messages');
        const messageUpDir = join(storePath, 'message-up');
        const webhookDir = join(storePath, 'webhook');
        const chatwootDir = join(storePath, 'chatwoot');
        const settingsDir = join(storePath, 'settings');
        const websocketDir = join(storePath, 'websocket');
        const rabbitmqDir = join(storePath, 'rabbitmq');
        const typebotDir = join(storePath, 'typebot');
        const proxyDir = join(storePath, 'proxy');
        const tempDir = join(storePath, 'temp');

        if (!fs.existsSync(authDir)) {
          this.logger.verbose('creating auth dir: ' + authDir);
          fs.mkdirSync(authDir, { recursive: true });
        }
        if (!fs.existsSync(chatsDir)) {
          this.logger.verbose('creating chats dir: ' + chatsDir);
          fs.mkdirSync(chatsDir, { recursive: true });
        }
        if (!fs.existsSync(contactsDir)) {
          this.logger.verbose('creating contacts dir: ' + contactsDir);
          fs.mkdirSync(contactsDir, { recursive: true });
        }
        if (!fs.existsSync(messagesDir)) {
          this.logger.verbose('creating messages dir: ' + messagesDir);
          fs.mkdirSync(messagesDir, { recursive: true });
        }
        if (!fs.existsSync(messageUpDir)) {
          this.logger.verbose('creating message-up dir: ' + messageUpDir);
          fs.mkdirSync(messageUpDir, { recursive: true });
        }
        if (!fs.existsSync(webhookDir)) {
          this.logger.verbose('creating webhook dir: ' + webhookDir);
          fs.mkdirSync(webhookDir, { recursive: true });
        }
        if (!fs.existsSync(chatwootDir)) {
          this.logger.verbose('creating chatwoot dir: ' + chatwootDir);
          fs.mkdirSync(chatwootDir, { recursive: true });
        }
        if (!fs.existsSync(settingsDir)) {
          this.logger.verbose('creating settings dir: ' + settingsDir);
          fs.mkdirSync(settingsDir, { recursive: true });
        }
        if (!fs.existsSync(websocketDir)) {
          this.logger.verbose('creating websocket dir: ' + websocketDir);
          fs.mkdirSync(websocketDir, { recursive: true });
        }
        if (!fs.existsSync(rabbitmqDir)) {
          this.logger.verbose('creating rabbitmq dir: ' + rabbitmqDir);
          fs.mkdirSync(rabbitmqDir, { recursive: true });
        }
        if (!fs.existsSync(typebotDir)) {
          this.logger.verbose('creating typebot dir: ' + typebotDir);
          fs.mkdirSync(typebotDir, { recursive: true });
        }
        if (!fs.existsSync(proxyDir)) {
          this.logger.verbose('creating proxy dir: ' + proxyDir);
          fs.mkdirSync(proxyDir, { recursive: true });
        }
        if (!fs.existsSync(tempDir)) {
          this.logger.verbose('creating temp dir: ' + tempDir);
          fs.mkdirSync(tempDir, { recursive: true });
        }
      } catch (error) {
        this.logger.error(error);
      }
    } else {
      try {
        const storePath = join(process.cwd(), 'store');

        this.logger.verbose('creating store path: ' + storePath);

        const tempDir = join(storePath, 'temp');
        const chatwootDir = join(storePath, 'chatwoot');

        if (!fs.existsSync(chatwootDir)) {
          this.logger.verbose('creating chatwoot dir: ' + chatwootDir);
          fs.mkdirSync(chatwootDir, { recursive: true });
        }
        if (!fs.existsSync(tempDir)) {
          this.logger.verbose('creating temp dir: ' + tempDir);
          fs.mkdirSync(tempDir, { recursive: true });
        }
      } catch (error) {
        this.logger.error(error);
      }
    }
  }
}
