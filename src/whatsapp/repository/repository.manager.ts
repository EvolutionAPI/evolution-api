import { MessageRepository } from './message.repository';
import { ChatRepository } from './chat.repository';
import { ContactRepository } from './contact.repository';
import { MessageUpRepository } from './messageUp.repository';
import { MongoClient } from 'mongodb';
import { WebhookRepository } from './webhook.repository';
import { AuthRepository } from './auth.repository';

export class RepositoryBroker {
  constructor(
    public readonly message: MessageRepository,
    public readonly chat: ChatRepository,
    public readonly contact: ContactRepository,
    public readonly messageUpdate: MessageUpRepository,
    public readonly webhook: WebhookRepository,
    public readonly auth: AuthRepository,
    dbServer?: MongoClient,
  ) {
    this.dbClient = dbServer;
  }

  private dbClient?: MongoClient;

  public get dbServer() {
    return this.dbClient;
  }
}
