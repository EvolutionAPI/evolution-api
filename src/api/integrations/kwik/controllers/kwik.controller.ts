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
          lastAllMsgTimestamp: { $max: '$messageTimestamp' }
        },
    }
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
    const chat_id_list = msgs.map(m=>m._id)
    const chat_promises = connection.collection('chats').find({ id: { $in: chat_id_list}}).toArray()
    const last_messages_promises = connection.collection('messages').find({
      owner: instanceName,
      messageTimestamp: { $in : msgs.map(m=>m.lastAllMsgTimestamp)},
      "key.remoteJid": { $in: chat_id_list}
    }).toArray()
    const contacts_promises = connection.collection('contacts').find({
      owner: instanceName,
      id: { $in: chat_id_list},
    }).toArray()

    const group_promises = chat_id_list.filter(g => g.includes('@g.us')).map(g=> this.waMonitor.waInstances[instanceName].findGroup({groupJid: g}, "inner"))

    const [chats_solved, last_messages_solved, contacts_solved, ...groups_solved] = await Promise.all([chat_promises, last_messages_promises, contacts_promises, ...group_promises])

    const chats = Object.fromEntries(chats_solved.map(m => ([m.id, m])))
    const last_messages = Object.fromEntries(last_messages_solved.map(m => ([m.key.remoteJid, m])))
    const contacts = Object.fromEntries(contacts_solved.map(c => ([c.id, c])))
    const groups = Object.fromEntries(groups_solved.map(g => {if (g) return [g.id, g]}))

        
    const mm = msgs.map((msg) => {
        const chat = chats[String(msg._id)]
        const lastMsg = last_messages[String(msg._id)]

        const chat_data = {
          id: chat.id,
          labels: chat.labels,
          owner: chat.owner,
          last_message_timestamp: msg.lastAllMsgTimestamp,
          message: this.isTextMessage(lastMsg) ? lastMsg.message : null,
          message_type: lastMsg.messageType,
          phone_num: null,
          profile_picture: null,
          name: null,
          type: null,
        };

        const info = chat.id.split('@');
        if (info[1] == 'g.us') {
          chat_data.type = 'GROUP';
          const group = groups[String(msg._id)]
          if (group){
            chat_data.name = group.subject;
            chat_data.profile_picture = group.pictureUrl;
          }
        } else {
          const contact = contacts[String(msg._id)]
          chat_data.type = 'CONTACT';
          chat_data.phone_num = info[0];
          if (contact) {
            chat_data.name = contact.pushName;
            chat_data.profile_picture = contact.profilePictureUrl;
          }
        }

        return chat_data;
      })

    return mm;
  }
  public async cleanup({ instanceName }: InstanceDto) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const messages = connection.collection('messages');
    const messageUpdate = connection.collection('messageUpdate');
    const chats = connection.collection('chats');
    const contacts = connection.collection('contacts');
    logger.error('DELETEME: Deleting messages for instance ' + instanceName);
    const x = messages.deleteMany({ owner: instanceName });
    logger.error(x);
    const y = chats.deleteMany({ owner: instanceName });
    logger.error(y);
    const z = contacts.deleteMany({ owner: instanceName });
    logger.error(z);
    messageUpdate.deleteMany({ owner: instanceName });

    return { status: 'ok' };
  }
}
