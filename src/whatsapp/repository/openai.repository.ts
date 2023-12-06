import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IContactOpenaiModel, ContactOpenaiRaw, IOpenaiModel, OpenaiRaw } from '../models';

export class OpenaiRepository extends Repository {
  constructor(
    private readonly openaiModel: IOpenaiModel, 
    private readonly contactopenaiModel: IContactOpenaiModel, 
    private readonly configService: ConfigService
  ) {
    super(configService);
  }

  private readonly logger = new Logger('OpenaiRepository');

  public async create(data: OpenaiRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating openai');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving openai to db');
        const insert = await this.openaiModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('openai saved to db: ' + insert.modifiedCount + ' openai');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving openai to store');

      this.writeStore<OpenaiRaw>({
        path: join(this.storePath, 'openai'),
        fileName: instance,
        data,
      });

      this.logger.verbose('openai saved to store in path: ' + join(this.storePath, 'openai') + '/' + instance);

      this.logger.verbose('openai created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }
  public async createContact(data: ContactOpenaiRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating contact openai');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving openai to db');
        var resultado = await this.openaiModel.findOne({ owner: instance, contact: data.contact });
        if(!resultado){
          const insert = await this.contactopenaiModel.insertMany({ ...data });

          this.logger.verbose('openai saved to db: ' + insert.length + ' openai_contacts');
          return { insertCount: insert.length };

        }else{
          const contacts = []
          contacts[0] = {
              updateOne: {
              filter: { owner: data.owner, contact: data.contact },
                update: { ...data },
                upsert: true,
              },
            };

          const { nModified } = await this.contactopenaiModel.bulkWrite(contacts);

          this.logger.verbose('contacts updated in db: ' + nModified + ' contacts');
          return { insertCount: nModified };
        }

      }

      this.logger.verbose('saving openai to store');

      this.writeStore<OpenaiRaw>({
        path: join(this.storePath, 'openai_contact'),
        fileName: instance,
        data,
      });

      this.logger.verbose('openai contact saved to store in path: ' + join(this.storePath, 'openai_contact') + '/' + instance);

      this.logger.verbose('openai contact created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<OpenaiRaw> {
    try {
      this.logger.verbose('finding openai');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding openai in db');
        return await this.openaiModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding openai in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'openai', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as OpenaiRaw;
    } catch (error) {
      return {};
    }
  }

  public async findContact(instance: string, contact: string): Promise<ContactOpenaiRaw> {
    try {
      this.logger.verbose('finding openai');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding openai in db');
        
        return await this.contactopenaiModel.findOne({ owner: instance,contact: contact});
      }

      this.logger.verbose('finding openai in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'openai_contact', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as ContactOpenaiRaw;
    } catch (error) {
      
      return ;
    }
  }

  public async findContactAll(instance: string): Promise<any> {
    try {
      this.logger.verbose('finding openai');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding openai in db');
        return await this.contactopenaiModel.find({ owner: instance });
      }

      this.logger.verbose('finding openai in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'openai_contact', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as ContactOpenaiRaw;
    } catch (error) {

      return;
    }
  }
}
