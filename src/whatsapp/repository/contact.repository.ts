import { opendirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService, StoreConf } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { ContactRaw, ContactRawSelect, IContactModel } from '../models';

export class ContactQuery {
  select?: ContactRawSelect;
  where: ContactRaw;
}

export class ContactQueryMany {
  owner: ContactRaw['owner'];
  ids: ContactRaw['id'][];
}

export class ContactRepository extends Repository {
  constructor(private readonly contactModel: IContactModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('ContactRepository');

  public async insert(data: ContactRaw[], instanceName: string, saveDb = false): Promise<IInsert> {
    this.logger.verbose('inserting contacts');

    if (data.length === 0) {
      this.logger.verbose('no contacts to insert');
      return;
    }

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        this.logger.verbose('saving contacts to db');

        const insert = await this.contactModel.insertMany([...data]);

        this.logger.verbose('contacts saved to db: ' + insert.length + ' contacts');
        return { insertCount: insert.length };
      }

      this.logger.verbose('saving contacts to store');

      const store = this.configService.get<StoreConf>('STORE');

      if (store.CONTACTS) {
        this.logger.verbose('saving contacts to store');
        data.forEach((contact) => {
          this.writeStore({
            path: join(this.storePath, 'contacts', instanceName),
            fileName: contact.id,
            data: contact,
          });
          this.logger.verbose(
            'contacts saved to store in path: ' + join(this.storePath, 'contacts', instanceName) + '/' + contact.id,
          );
        });

        this.logger.verbose('contacts saved to store: ' + data.length + ' contacts');
        return { insertCount: data.length };
      }

      this.logger.verbose('contacts not saved');
      return { insertCount: 0 };
    } catch (error) {
      return error;
    } finally {
      data = undefined;
    }
  }

  public async update(data: ContactRaw[], instanceName: string, saveDb = false): Promise<IInsert> {
    try {
      this.logger.verbose('updating contacts');

      if (data.length === 0) {
        this.logger.verbose('no contacts to update');
        return;
      }

      if (this.dbSettings.ENABLED && saveDb) {
        this.logger.verbose('updating contacts in db');

        const contacts = data.map((contact) => {
          return {
            updateOne: {
              filter: { id: contact.id },
              update: { ...contact },
              upsert: true,
            },
          };
        });

        const { nModified } = await this.contactModel.bulkWrite(contacts);

        this.logger.verbose('contacts updated in db: ' + nModified + ' contacts');
        return { insertCount: nModified };
      }

      this.logger.verbose('updating contacts in store');

      const store = this.configService.get<StoreConf>('STORE');

      if (store.CONTACTS) {
        this.logger.verbose('updating contacts in store');
        data.forEach((contact) => {
          this.writeStore({
            path: join(this.storePath, 'contacts', instanceName),
            fileName: contact.id,
            data: contact,
          });
          this.logger.verbose(
            'contacts updated in store in path: ' + join(this.storePath, 'contacts', instanceName) + '/' + contact.id,
          );
        });

        this.logger.verbose('contacts updated in store: ' + data.length + ' contacts');

        return { insertCount: data.length };
      }

      this.logger.verbose('contacts not updated');
      return { insertCount: 0 };
    } catch (error) {
      return error;
    } finally {
      data = undefined;
    }
  }

  public async find(query: ContactQuery): Promise<ContactRaw[]> {
    try {
      this.logger.verbose('finding contacts');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding contacts in db');
        return await this.contactModel.find({ ...query.where }).select(query.select ?? {});
      }

      this.logger.verbose('finding contacts in store');
      const contacts: ContactRaw[] = [];
      if (query?.where?.id) {
        this.logger.verbose('finding contacts in store by id');
        contacts.push(
          JSON.parse(
            readFileSync(join(this.storePath, 'contacts', query.where.owner, query.where.id + '.json'), {
              encoding: 'utf-8',
            }),
          ),
        );
      } else {
        this.logger.verbose('finding contacts in store by owner');

        const openDir = opendirSync(join(this.storePath, 'contacts', query.where.owner), {
          encoding: 'utf-8',
        });
        for await (const dirent of openDir) {
          if (dirent.isFile()) {
            contacts.push(
              JSON.parse(
                readFileSync(join(this.storePath, 'contacts', query.where.owner, dirent.name), {
                  encoding: 'utf-8',
                }),
              ),
            );
          }
        }
      }

      this.logger.verbose('contacts found in store: ' + contacts.length + ' contacts');
      return contacts;
    } catch (error) {
      return [];
    }
  }

  public async findManyById(query: ContactQueryMany): Promise<ContactRaw[]> {
    try {
      this.logger.verbose('finding contacts');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding contacts in db');
        return await this.contactModel.find({
          owner: query.owner,
          id: { $in: query.ids },
        });
      }

      this.logger.verbose('finding contacts in store');
      const contacts: ContactRaw[] = [];
      if (query.ids.length > 0) {
        this.logger.verbose('finding contacts in store by id');
        query.ids.forEach((id) => {
          contacts.push(
            JSON.parse(
              readFileSync(join(this.storePath, 'contacts', query.owner, id + '.json'), {
                encoding: 'utf-8',
              }),
            ),
          );
        });
      } else {
        this.logger.verbose('finding contacts in store by owner');

        const openDir = opendirSync(join(this.storePath, 'contacts', query.owner), {
          encoding: 'utf-8',
        });
        for await (const dirent of openDir) {
          if (dirent.isFile()) {
            contacts.push(
              JSON.parse(
                readFileSync(join(this.storePath, 'contacts', query.owner, dirent.name), {
                  encoding: 'utf-8',
                }),
              ),
            );
          }
        }
      }

      this.logger.verbose('contacts found in store: ' + contacts.length + ' contacts');
      return contacts;
    } catch (error) {
      return [];
    }
  }
}
