import { MessageRepository } from './message.repository';
import { ChatRepository } from './chat.repository';
import { ContactRepository } from './contact.repository';
import { MessageUpRepository } from './messageUp.repository';
import { MongoClient } from 'mongodb';
import { WebhookRepository } from './webhook.repository';
import { ChatwootRepository } from './chatwoot.repository';

import { AuthRepository } from './auth.repository';
import { Auth, ConfigService, Database } from '../../config/env.config';
import { execSync } from 'child_process';
import { join } from 'path';
import fs from 'fs';
import { Logger } from '../../config/logger.config';
export class RepositoryBroker {
  constructor(
    public readonly message: MessageRepository,
    public readonly chat: ChatRepository,
    public readonly contact: ContactRepository,
    public readonly messageUpdate: MessageUpRepository,
    public readonly webhook: WebhookRepository,
    public readonly chatwoot: ChatwootRepository,
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
        const authDir = join(
          storePath,
          'auth',
          this.configService.get<Auth>('AUTHENTICATION').TYPE,
        );
        const chatsDir = join(storePath, 'chats');
        const contactsDir = join(storePath, 'contacts');
        const messagesDir = join(storePath, 'messages');
        const messageUpDir = join(storePath, 'message-up');
        const webhookDir = join(storePath, 'webhook');
        const chatwootDir = join(storePath, 'chatwoot');

        // Check if directories exist, create them if not
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
      } catch (error) {
        this.logger.error(error);
      }
    }
  }
}
