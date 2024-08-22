import { Document } from 'bson';

import { configService, Database } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { dbserver } from '../../../../libs/db.connect';
import { InstanceDto } from '../../../dto/instance.dto';
import { WAMonitoringService } from '../../../services/monitor.service';

const logger = new Logger('KwikController');

export class KwikController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private isTextMessage(message: any) {
    return message.messageType === 'conversation' || message.messageType === 'extendedTextMessage';
  }
  public async fetchChats({ instanceName }: InstanceDto, limit: number, skip: number, sort: any) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const messages = connection.collection('messages');
    const pipeline: Document[] = [
      { $match: { owner: instanceName } },
      {
        $group: {
          _id: '$key.remoteJid',
          lastAllMsgTimestamp: { $max: '$messageTimestamp' },
        },
      },
    ];

    if (sort === 'asc') {
      pipeline.push({ $sort: { lastAllMsgTimestamp: 1 } });
    } else {
      pipeline.push({ $sort: { lastAllMsgTimestamp: -1 } });
    }

    if (!isNaN(skip)) {
      pipeline.push({ $skip: skip });
    }

    if (!isNaN(limit)) {
      pipeline.push({ $limit: limit });
    }

    const msgs = await messages.aggregate(pipeline).toArray();
    const mm = await Promise.all(
      msgs.map(async (msg) => {
        const chat = await connection.collection('chats').findOne({ id: msg._id });
        const lastMsg = await this.waMonitor.waInstances[instanceName].repository.message.find({
          where: {
            owner: instanceName,
            messageTimestamp: msg.lastAllMsgTimestamp,
            key: {
              remoteJid: chat.id,
            },
          },
          limit: 1,
        });

        const chat_data = {
          id: chat.id,
          labels: chat.labels,
          owner: chat.owner,
          last_message_timestamp: msg.lastAllMsgTimestamp,
          message: this.isTextMessage(lastMsg[0]) ? lastMsg[0].message : null,
          message_type: lastMsg[0].messageType,
          phone_num: null,
          profile_picture: null,
          name: null,
          type: null,
        };

        const info = chat.id.split('@');
        logger.error(info);
        if (info[1] == 'g.us') {
          chat_data.type = 'GROUP';
        } else {
          const contact = await this.waMonitor.waInstances[instanceName].fetchContacts({
            where: {
              owner: instanceName,
              id: chat.id,
            },
          });
          chat_data.type = 'CONTACT';
          chat_data.phone_num = info[0];
          if (contact && contact.length > 0) {
            chat_data.name = contact[0].pushName;
            chat_data.profile_picture = contact[0].profilePictureUrl;
          }
        }

        return chat_data;
      }),
    );

    return mm;
  }
}
