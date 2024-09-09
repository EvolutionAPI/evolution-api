import { calculateObjectSize, Document } from 'bson';

import { configService, Database } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { dbserver } from '../../../../libs/db.connect';
import { InstanceDto } from '../../../dto/instance.dto';
import { WAMonitoringService } from '../../../services/monitor.service';

const logger = new Logger('KwikController');

export class KwikController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private isTextMessage(messageType: any) {
    return ['senderKeyDistributionMessage', 'conversation', 'extendedTextMessage', 'protocolMessage'].includes(messageType);
  }
  public async fetchChats(
    { instanceName }: InstanceDto,
    limit: number,
    skip: number,
    sort: any,
    messageTimestamp: number,
  ) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const messages = connection.collection('messages');
    const pipeline: Document[] = [
      { $sort: { 'key.remoteJid': -1, messageTimestamp: -1 } },
      { $match: { owner: instanceName }},
      {
        $group: {
          _id: '$key.remoteJid',
          owner: { $first: '$owner' },
          message: { $first: '$message' },
          lastAllMsgTimestamp: { $first: '$messageTimestamp' },
          name: { $first: '$pushName' },
          fromMe: { $first: '$key.fromMe' },
        },
      },
      { $match: { lastAllMsgTimestamp: { $gte: messageTimestamp } } },
      { $sort: { lastAllMsgTimestamp: -1 } },
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
    const chat_id_list = msgs.map((m) => m._id);

    const contacts_promises = connection
      .collection('contacts')
      .find({
        owner: instanceName,
        id: { $in: chat_id_list },
      })
      .toArray();

    const group_promises = chat_id_list
      .filter((g) => g.includes('@g.us'))
      .map((g) => this.waMonitor.waInstances[instanceName].findGroup({ groupJid: g }, 'inner'));

    const [contacts_solved, ...groups_solved] = await Promise.all([contacts_promises, ...group_promises]);

    const contacts = Object.fromEntries(contacts_solved.map((c) => [c.id, c]));
    const groups = Object.fromEntries(
      groups_solved.map((g) => {
        if (g) return [g.id, g];
      }),
    );

    const mm = msgs.map((msg) => {
      const [messageType] = Object.entries(msg.message)[0] || ['none', ''];

      const chat_data = {
        id: msg._id,
        labels: [],
        owner: msg.owner,
        last_message_timestamp: msg.lastAllMsgTimestamp,
        message: this.isTextMessage(messageType) ? msg.message : null,
        message_type: messageType,
        fromMe: msg.fromMe,
        phone_num: null,
        profile_picture: null,
        name: null,
        sender: msg.name,
        type: null,
      };

      const info = msg._id.split('@');
      if (info[1] == 'g.us') {
        chat_data.type = 'GROUP';
        const group = groups[String(msg._id)];
        if (group) {
          chat_data.name = group.subject;
          chat_data.profile_picture = group.pictureUrl;
        }
      } else {
        const contact = contacts[String(msg._id)];
        chat_data.type = 'CONTACT';
        chat_data.phone_num = info[0];
        if (contact) {
          chat_data.name = contact.pushName;
          chat_data.profile_picture = contact.profilePictureUrl;
        }
      }

      return chat_data;
    });

    return mm;
  }
  public async cleanup({ instanceName }: InstanceDto) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const messages = connection.collection('messages');
    const messageUpdate = connection.collection('messageUpdate');
    const chats = connection.collection('chats');
    const contacts = connection.collection('contacts');
    const x = messages.deleteMany({ owner: instanceName });
    logger.error(x);
    const y = chats.deleteMany({ owner: instanceName });
    logger.error(y);
    const z = contacts.deleteMany({ owner: instanceName });
    logger.error(z);
    messageUpdate.deleteMany({ owner: instanceName });
    connection.collection('settings').deleteMany({ _id: instanceName });

    return { status: 'ok' };
  }
  public async instanceInfo({ instanceName }: InstanceDto, messageTimestamp: number, usage?: number) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const messages = connection.collection('messages');
    const pipeline: Document[] = [
      { $sort: { 'key.remoteJid': -1, messageTimestamp: -1 } },
      {
        $group: {
          _id: '$key.remoteJid',
          owner: { $first: '$owner' },
          message: { $first: '$message' },
          lastAllMsgTimestamp: { $first: '$messageTimestamp' },
          name: { $first: '$pushName' },
          fromMe: { $first: '$key.fromMe' },
        },
      },
      { $match: { owner: instanceName, lastAllMsgTimestamp: { $gte: messageTimestamp } } },
      { $count: 'rowCount' },
    ];
    const chatCount = await messages.aggregate(pipeline).toArray();

    if (usage) {
      return {
        chatCount: chatCount[0].rowCount,
        totalSize: usage,
        newVal: 0,
      };
    } else {
      const userMessages = await messages
        .find({ owner: instanceName, messageTimestamp: { $gte: messageTimestamp } })
        .toArray();

      let totalSize = 0;

      userMessages.forEach(function (doc) {
        totalSize += calculateObjectSize(doc);
      });

      return {
        chatCount: chatCount[0].rowCount,
        totalSize: totalSize,
        newVal: 1,
      };
    }
  }
}
