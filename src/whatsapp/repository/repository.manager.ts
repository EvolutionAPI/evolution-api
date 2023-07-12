import { MessageRepository } from './message.repository';
import { ChatRepository } from './chat.repository';
import { ContactRepository } from './contact.repository';
import { MessageUpRepository } from './messageUp.repository';
import { MongoClient } from 'mongodb';
import { WebhookRepository } from './webhook.repository';
import { AuthRepository } from './auth.repository';
import { Auth, ConfigService, Database } from '../../config/env.config';
import { execSync } from 'child_process';
import { join } from 'path';
import { Logger } from '../../config/logger.config';

export class RepositoryBroker {
  constructor(
    public readonly message: MessageRepository,
    public readonly chat: ChatRepository,
    public readonly contact: ContactRepository,
    public readonly messageUpdate: MessageUpRepository,
    public readonly webhook: WebhookRepository,
    public readonly auth: AuthRepository,
    private configService: ConfigService,
    dbServer?: MongoClient,
  ) {
    this.logger.verbose('initializing repository broker');
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
      this.logger.verbose('database is disabled');

      const storePath = join(process.cwd(), 'store');

      this.logger.verbose('creating store path: ' + storePath);
      execSync(
        `mkdir -p ${join(
          storePath,
          'auth',
          this.configService.get<Auth>('AUTHENTICATION').TYPE,
        )}`,
      );

      this.logger.verbose('creating chats path: ' + join(storePath, 'chats'));
      execSync(`mkdir -p ${join(storePath, 'chats')}`);

      this.logger.verbose('creating contacts path: ' + join(storePath, 'contacts'));
      execSync(`mkdir -p ${join(storePath, 'contacts')}`);

      this.logger.verbose('creating messages path: ' + join(storePath, 'messages'));
      execSync(`mkdir -p ${join(storePath, 'messages')}`);

      this.logger.verbose('creating message-up path: ' + join(storePath, 'message-up'));
      execSync(`mkdir -p ${join(storePath, 'message-up')}`);

      this.logger.verbose('creating webhook path: ' + join(storePath, 'webhook'));
      execSync(`mkdir -p ${join(storePath, 'webhook')}`);

      this.logger.verbose('creating temp path: ' + join(storePath, 'temp'));
      execSync(`mkdir -p ${join(storePath, 'temp')}`);
    }
  }
}
