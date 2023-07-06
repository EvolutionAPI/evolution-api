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
    this.dbClient = dbServer;
    this.__init_repo_without_db__();
  }

  private dbClient?: MongoClient;

  public get dbServer() {
    return this.dbClient;
  }

  private __init_repo_without_db__() {
    if (!this.configService.get<Database>('DATABASE').ENABLED) {
      const storePath = join(process.cwd(), 'store');
      execSync(
        `mkdir -p ${join(
          storePath,
          'auth',
          this.configService.get<Auth>('AUTHENTICATION').TYPE,
        )}`,
      );
      execSync(`mkdir -p ${join(storePath, 'chats')}`);
      execSync(`mkdir -p ${join(storePath, 'contacts')}`);
      execSync(`mkdir -p ${join(storePath, 'messages')}`);
      execSync(`mkdir -p ${join(storePath, 'message-up')}`);
      execSync(`mkdir -p ${join(storePath, 'webhook')}`);
    }
  }
}
