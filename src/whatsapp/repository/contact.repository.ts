import { opendirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '../../config/env.config';
import { ContactRaw, IContactModel } from '../models';
import { IInsert, Repository } from '../abstract/abstract.repository';

export class ContactQuery {
  where: ContactRaw;
}

export class ContactRepository extends Repository {
  constructor(
    private readonly contactModel: IContactModel,
    private readonly configService: ConfigService,
  ) {
    super(configService);
  }

  public async insert(data: ContactRaw[], saveDb = false): Promise<IInsert> {
    if (data.length === 0) {
      return;
    }

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        const insert = await this.contactModel.insertMany([...data]);
        return { insertCount: insert.length };
      }

      data.forEach((contact) => {
        this.writeStore({
          path: join(this.storePath, 'contacts', contact.owner),
          fileName: contact.id,
          data: contact,
        });
      });

      return { insertCount: data.length };
    } catch (error) {
      return error;
    } finally {
      data = undefined;
    }
  }

  public async find(query: ContactQuery): Promise<ContactRaw[]> {
    try {
      if (this.dbSettings.ENABLED) {
        return await this.contactModel.find({ ...query.where });
      }
      const contacts: ContactRaw[] = [];
      if (query?.where?.id) {
        contacts.push(
          JSON.parse(
            readFileSync(
              join(
                this.storePath,
                'contacts',
                query.where.owner,
                query.where.id + '.json',
              ),
              { encoding: 'utf-8' },
            ),
          ),
        );
      } else {
        const openDir = opendirSync(join(this.storePath, 'contacts', query.where.owner), {
          encoding: 'utf-8',
        });
        for await (const dirent of openDir) {
          if (dirent.isFile()) {
            contacts.push(
              JSON.parse(
                readFileSync(
                  join(this.storePath, 'contacts', query.where.owner, dirent.name),
                  { encoding: 'utf-8' },
                ),
              ),
            );
          }
        }
      }
      return contacts;
    } catch (error) {
      return [];
    }
  }
}
