import { calculateObjectSize, Document } from 'bson';

import { configService, Database } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { dbserver } from '../../../../libs/db.connect';
import { InstanceDto } from '../../../dto/instance.dto';
import { WAMonitoringService } from '../../../services/monitor.service';
import { SettingsService } from '../../../services/settings.service';

const logger = new Logger('KwikController');

type SearchObject = {
  text_search: string;
  where: string[];
};

export class KwikController {
  constructor(private readonly waMonitor: WAMonitoringService, private readonly settingsService: SettingsService) {}

  private isTextMessage(messageType: any) {
    return [
      'senderKeyDistributionMessage',
      'conversation',
      'extendedTextMessage',
      'protocolMessage',
      'messageContextInfo',
    ].includes(messageType);
  }

  private async findOffsetByUUID(query, sortOrder, docUUID, batchSize = 1000) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const collection = connection.collection('messages');

    let offset = 0;
    let found = false;

    while (!found) {
      // Fetch a batch of documents sorted as per the query
      const batch = await collection.find(query).sort(sortOrder).skip(offset).limit(batchSize).toArray();
      const index = batch.findIndex((doc) => doc.key.id === docUUID);

      if (index !== -1) {
        // If the document is found in the batch, calculate its offset
        found = true;
        offset += index;
      } else if (batch.length < batchSize) {
        // If the batch is smaller than batchSize, we have exhausted the collection
        throw new Error(`Document with UUID ${docUUID} not found in the collection.`);
      } else {
        // Otherwise, move the offset forward by the batch size and continue searching
        offset += batchSize;
      }
    }

    return offset;
  }

  private firstMultipleBefore(X, Y) {
    return Math.floor(Y / X) * X;
  }

  public async messageOffset(
    { instanceName }: InstanceDto,
    messageTimestamp: number,
    remoteJid: string,
    sort: any,
    limit: number,
    docUUID: string,
  ) {
    const query = {
      'key.remoteJid': remoteJid,
      messageTimestamp: { $gte: messageTimestamp },
      owner: instanceName,
    };
    const offset = await this.findOffsetByUUID(query, sort, docUUID);
    const multiple = this.firstMultipleBefore(limit, offset);
    return multiple;
  }

  public async fetchChats(
    { instanceName }: InstanceDto,
    limit: number,
    skip: number,
    sort: any,
    messageTimestamp: number,
    remoteJid?: string,
  ) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const messages = connection.collection('messages');
    let match: { owner: string; 'key.remoteJid'?: string } = { owner: instanceName };
    if (remoteJid) {
      match = { ...match, 'key.remoteJid': remoteJid };
    }
    const pipeline: Document[] = [
      { $sort: { 'key.remoteJid': -1, messageTimestamp: -1 } },
      { $match: match },
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
    connection.collection('messages').deleteMany({ owner: instanceName });
    connection.collection('chats').deleteMany({ owner: instanceName });
    connection.collection('contacts').deleteMany({ owner: instanceName });
    connection.collection('messageUpdate').deleteMany({ owner: instanceName });
    connection.collection('settings').deleteMany({ _id: instanceName });
    connection.collection('integration').deleteMany({ _id: instanceName });
    connection.collection('authentication').deleteMany({ _id: instanceName });

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
  public async cleanChats(instance: InstanceDto) {
    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const settings = this.settingsService.find(instance);
    const initialConnection = (await settings).initial_connection;
    if (initialConnection) {
      connection
        .collection('messages')
        .deleteMany({ owner: instance.instanceName, messageTimestamp: { $lt: initialConnection } });
    }

    return { status: 'ok' };
  }

  public async textSearch({ instanceName }: InstanceDto, query: SearchObject) {
    logger.verbose('request received in textSearch');
    logger.verbose(instanceName);
    logger.verbose(query);

    const db = configService.get<Database>('DATABASE');
    const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
    const messages = await connection
      .collection('messages')
      .find({
        owner: { $in: query.where },
        $text: { $search: query.text_search },
      })
      .limit(100)
      .toArray();

    const data = [];

    const uniqueContacts = Array.from(
      new Set(messages.filter((m) => !m.key.remoteJid.includes('@g.us')).map((m) => `${m.owner}#${m.key.remoteJid}`)),
    );
    const contacts_promises = uniqueContacts.map((m) => {
      return connection.collection('contacts').findOne({ owner: m.split('#')[0], id: m.split('#')[1] });
    });
    const uniqueGroups = Array.from(
      new Set(messages.filter((m) => m.key.remoteJid.includes('@g.us')).map((m) => `${m.owner}#${m.key.remoteJid}`)),
    );

    const groups_promises = uniqueGroups.map(async (g) => {
      const instanceName = g.split('#')[0];
      const groupJid = g.split('#')[1];
      const group = await this.waMonitor.waInstances[instanceName].findGroup({ groupJid }, 'inner');

      return group ? { ...group, instanceName } : null;
    });

    const [...contacts_solved] = await Promise.all([...contacts_promises]);
    const [...groups_solved] = await Promise.all([...groups_promises]);

    const contacts = Object.fromEntries(contacts_solved.filter((c) => c != null).map((c) => [`${c.owner}#${c.id}`, c]));
    const groups = Object.fromEntries(
      groups_solved.filter((g) => g !== null).map((g) => [`${g.instanceName}#${g.id}`, g]),
    );

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const info = message.key.remoteJid.split('@');
      let type;
      let tinfo;
      if (info[1] == 'g.us') {
        tinfo = groups[`${message.owner}#${message.key.remoteJid}`];

        type = 'GROUP';
      } else {
        tinfo = contacts[`${message.owner}#${message.key.remoteJid}`];
        type = 'CONTACT';
      }
      data.push({
        message: message,

        owner: message.owner,
        conversation: `${message.owner}#${info}`,
        type: type,
        info: tinfo,
      });
    }

    return { data };
  }
}
