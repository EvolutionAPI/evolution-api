import { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import { v4 } from 'uuid';

const isNotEmpty = (...propertyNames: string[]): JSONSchema7 => {
  const properties = {};
  propertyNames.forEach(
    (property) =>
      (properties[property] = {
        minLength: 1,
        description: `The "${property}" cannot be empty`,
      }),
  );
  return {
    if: {
      propertyNames: {
        enum: [...propertyNames],
      },
    },
    then: { properties },
  };
};

// Instance Schema
export const instanceNameSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    instanceName: { type: 'string' },
    webhook: { type: 'string' },
    webhook_by_events: { type: 'boolean' },
    events: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'CALL',
          'NEW_JWT_TOKEN',
        ],
      },
    },
    qrcode: { type: 'boolean', enum: [true, false] },
    number: { type: 'string', pattern: '^\\d+[\\.@\\w-]+' },
    token: { type: 'string' },
  },
  ...isNotEmpty('instanceName'),
};

export const oldTokenSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    oldToken: { type: 'string' },
  },
  required: ['oldToken'],
  ...isNotEmpty('oldToken'),
};

const quotedOptionsSchema: JSONSchema7 = {
  properties: {
    key: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        remoteJid: { type: 'string' },
        fromMe: { type: 'boolean', enum: [true, false] },
      },
      required: ['id'],
      ...isNotEmpty('id'),
    },
    message: { type: 'object' },
  },
};

const mentionsOptionsSchema: JSONSchema7 = {
  properties: {
    everyOne: { type: 'boolean', enum: [true, false] },
    mentioned: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'string',
        pattern: '^\\d+',
        description: '"mentioned" must be an array of numeric strings',
      },
    },
  },
};

// Send Message Schema
const optionsSchema: JSONSchema7 = {
  properties: {
    delay: {
      type: 'integer',
      description: 'Enter a value in milliseconds',
    },
    presence: {
      type: 'string',
      enum: ['unavailable', 'available', 'composing', 'recording', 'paused'],
    },
    quoted: { ...quotedOptionsSchema },
    mentions: { ...mentionsOptionsSchema },
  },
};

const numberDefinition: JSONSchema7Definition = {
  type: 'string',
  description: 'Invalid format',
};

export const textMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    textMessage: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
      ...isNotEmpty('text'),
    },
  },
  required: ['textMessage', 'number'],
};

export const pollMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    pollMessage: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        selectableCount: { type: 'integer', minimum: 0, maximum: 10 },
        values: {
          type: 'array',
          minItems: 2,
          maxItems: 10,
          uniqueItems: true,
          items: {
            type: 'string',
          },
        },
      },
      required: ['name', 'selectableCount', 'values'],
      ...isNotEmpty('name', 'selectableCount', 'values'),
    },
  },
  required: ['pollMessage', 'number'],
};

export const statusMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    statusMessage: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['text', 'image', 'audio', 'video'] },
        content: { type: 'string' },
        caption: { type: 'string' },
        backgroundColor: { type: 'string' },
        font: { type: 'integer', minimum: 0, maximum: 5 },
        statusJidList: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: {
            type: 'string',
            pattern: '^\\d+',
            description: '"statusJidList" must be an array of numeric strings',
          },
        },
        allContacts: { type: 'boolean', enum: [true, false] },
      },
      required: ['type', 'content'],
      ...isNotEmpty('type', 'content'),
    },
  },
  required: ['statusMessage'],
};

export const mediaMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    mediaMessage: {
      type: 'object',
      properties: {
        mediatype: { type: 'string', enum: ['image', 'document', 'video', 'audio'] },
        media: { type: 'string' },
        fileName: { type: 'string' },
        caption: { type: 'string' },
      },
      required: ['mediatype', 'media'],
      ...isNotEmpty('fileName', 'caption', 'media'),
    },
  },
  required: ['mediaMessage', 'number'],
};

export const stickerMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    stickerMessage: {
      type: 'object',
      properties: {
        image: { type: 'string' },
      },
      required: ['image'],
      ...isNotEmpty('image'),
    },
  },
  required: ['stickerMessage', 'number'],
};

export const audioMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    audioMessage: {
      type: 'object',
      properties: {
        audio: { type: 'string' },
      },
      required: ['audio'],
      ...isNotEmpty('audio'),
    },
  },
  required: ['audioMessage', 'number'],
};

export const buttonMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    buttonMessage: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        footerText: { type: 'string' },
        buttons: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: {
            type: 'object',
            properties: {
              buttonText: { type: 'string' },
              buttonId: { type: 'string' },
            },
            required: ['buttonText', 'buttonId'],
            ...isNotEmpty('buttonText', 'buttonId'),
          },
        },
        mediaMessage: {
          type: 'object',
          properties: {
            media: { type: 'string' },
            fileName: { type: 'string' },
            mediatype: { type: 'string', enum: ['image', 'document', 'video'] },
          },
          required: ['media', 'mediatype'],
          ...isNotEmpty('media', 'fileName'),
        },
      },
      required: ['title', 'buttons'],
      ...isNotEmpty('title', 'description'),
    },
  },
  required: ['number', 'buttonMessage'],
};

export const locationMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    locationMessage: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        name: { type: 'string' },
        address: { type: 'string' },
      },
      required: ['latitude', 'longitude'],
      ...isNotEmpty('name', 'addresss'),
    },
  },
  required: ['number', 'locationMessage'],
};

export const listMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    listMessage: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        footerText: { type: 'string' },
        buttonText: { type: 'string' },
        sections: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              rows: {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    rowId: { type: 'string' },
                  },
                  required: ['title', 'description', 'rowId'],
                  ...isNotEmpty('title', 'description', 'rowId'),
                },
              },
            },
            required: ['title', 'rows'],
            ...isNotEmpty('title'),
          },
        },
      },
      required: ['title', 'description', 'buttonText', 'sections'],
      ...isNotEmpty('title', 'description', 'buttonText', 'footerText'),
    },
  },
  required: ['number', 'listMessage'],
};

export const contactMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    contactMessage: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
          wuid: {
            type: 'string',
            minLength: 10,
            pattern: '\\d+',
            description: '"wuid" must be a numeric string',
          },
          phoneNumber: { type: 'string', minLength: 10 },
          organization: { type: 'string' },
          email: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['fullName', 'phoneNumber'],
        ...isNotEmpty('fullName'),
      },
      minItems: 1,
      uniqueItems: true,
    },
  },
  required: ['number', 'contactMessage'],
};

export const reactionMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    reactionMessage: {
      type: 'object',
      properties: {
        key: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            remoteJid: { type: 'string' },
            fromMe: { type: 'boolean', enum: [true, false] },
          },
          required: ['id', 'remoteJid', 'fromMe'],
          ...isNotEmpty('id', 'remoteJid'),
        },
        reaction: { type: 'string' },
      },
      required: ['key', 'reaction'],
      ...isNotEmpty('reaction'),
    },
  },
  required: ['reactionMessage'],
};

// Chat Schema
export const whatsappNumberSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    numbers: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'string',
        description: '"numbers" must be an array of numeric strings',
      },
    },
  },
};

export const readMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    read_messages: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        properties: {
          id: { type: 'string' },
          fromMe: { type: 'boolean', enum: [true, false] },
          remoteJid: { type: 'string' },
        },
        required: ['id', 'fromMe', 'remoteJid'],
        ...isNotEmpty('id', 'remoteJid'),
      },
    },
  },
  required: ['read_messages'],
};

export const privacySettingsSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    privacySettings: {
      type: 'object',
      properties: {
        readreceipts: { type: 'string', enum: ['all', 'none'] },
        profile: {
          type: 'string',
          enum: ['all', 'contacts', 'contact_blacklist', 'none'],
        },
        status: {
          type: 'string',
          enum: ['all', 'contacts', 'contact_blacklist', 'none'],
        },
        online: { type: 'string', enum: ['all', 'match_last_seen'] },
        last: { type: 'string', enum: ['all', 'contacts', 'contact_blacklist', 'none'] },
        groupadd: {
          type: 'string',
          enum: ['all', 'contacts', 'contact_blacklist', 'none'],
        },
      },
      required: ['readreceipts', 'profile', 'status', 'online', 'last', 'groupadd'],
      ...isNotEmpty('readreceipts', 'profile', 'status', 'online', 'last', 'groupadd'),
    },
  },
  required: ['privacySettings'],
};

export const archiveChatSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    chat: { type: 'string' },
    lastMessage: {
      type: 'object',
      properties: {
        key: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            remoteJid: { type: 'string' },
            fromMe: { type: 'boolean', enum: [true, false] },
          },
          required: ['id', 'fromMe', 'remoteJid'],
          ...isNotEmpty('id', 'remoteJid'),
        },
        messageTimestamp: { type: 'integer', minLength: 1 },
      },
      required: ['key'],
      ...isNotEmpty('messageTimestamp'),
    },
    archive: { type: 'boolean', enum: [true, false] },
  },
  required: ['archive'],
};

export const deleteMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    id: { type: 'string' },
    fromMe: { type: 'boolean', enum: [true, false] },
    remoteJid: { type: 'string' },
    participant: { type: 'string' },
  },
  required: ['id', 'fromMe', 'remoteJid'],
  ...isNotEmpty('id', 'remoteJid', 'participant'),
};

export const contactValidateSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    where: {
      type: 'object',
      properties: {
        _id: { type: 'string', minLength: 1 },
        pushName: { type: 'string', minLength: 1 },
        id: { type: 'string', minLength: 1 },
      },
      ...isNotEmpty('_id', 'id', 'pushName'),
    },
  },
};

export const profileNameSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  ...isNotEmpty('name'),
};

export const profileStatusSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    status: { type: 'string' },
  },
  ...isNotEmpty('status'),
};

export const profilePictureSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { type: 'string' },
    picture: { type: 'string' },
  },
};

export const profileSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    wuid: { type: 'string' },
    name: { type: 'string' },
    picture: { type: 'string' },
    status: { type: 'string' },
    isBusiness: { type: 'boolean' },
  },
};

export const messageValidateSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    where: {
      type: 'object',
      properties: {
        _id: { type: 'string', minLength: 1 },
        key: {
          type: 'object',
          if: {
            propertyNames: {
              enum: ['fromMe', 'remoteJid', 'id'],
            },
          },
          then: {
            properties: {
              remoteJid: {
                type: 'string',
                minLength: 1,
                description: 'The property cannot be empty',
              },
              id: {
                type: 'string',
                minLength: 1,
                description: 'The property cannot be empty',
              },
              fromMe: { type: 'boolean', enum: [true, false] },
            },
          },
        },
        message: { type: 'object' },
      },
      ...isNotEmpty('_id'),
    },
    limit: { type: 'integer' },
  },
};

export const messageUpSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    where: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        remoteJid: { type: 'string' },
        id: { type: 'string' },
        fromMe: { type: 'boolean', enum: [true, false] },
        participant: { type: 'string' },
        status: {
          type: 'string',
          enum: ['ERROR', 'PENDING', 'SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'],
        },
      },
      ...isNotEmpty('_id', 'remoteJid', 'id', 'status'),
    },
    limit: { type: 'integer' },
  },
};

// Group Schema
export const createGroupSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    subject: { type: 'string' },
    description: { type: 'string' },
    profilePicture: { type: 'string' },
    promoteParticipants: { type: 'boolean', enum: [true, false] },
    participants: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'string',
        minLength: 10,
        pattern: '\\d+',
        description: '"participants" must be an array of numeric strings',
      },
    },
  },
  required: ['subject', 'participants'],
  ...isNotEmpty('subject', 'description', 'profilePicture'),
};

export const groupJidSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string', pattern: '^[\\d-]+@g.us$' },
  },
  required: ['groupJid'],
  ...isNotEmpty('groupJid'),
};

export const getParticipantsSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    getParticipants: { type: 'string', enum: ['true', 'false'] },
  },
  required: ['getParticipants'],
  ...isNotEmpty('getParticipants'),
};

export const groupSendInviteSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    description: { type: 'string' },
    numbers: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'string',
        minLength: 10,
        pattern: '\\d+',
        description: '"numbers" must be an array of numeric strings',
      },
    },
  },
  required: ['groupJid', 'description', 'numbers'],
  ...isNotEmpty('groupJid', 'description', 'numbers'),
};

export const groupInviteSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    inviteCode: { type: 'string', pattern: '^[a-zA-Z0-9]{22}$' },
  },
  required: ['inviteCode'],
  ...isNotEmpty('inviteCode'),
};

export const updateParticipantsSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    action: {
      type: 'string',
      enum: ['add', 'remove', 'promote', 'demote'],
    },
    participants: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'string',
        minLength: 10,
        pattern: '\\d+',
        description: '"participants" must be an array of numeric strings',
      },
    },
  },
  required: ['groupJid', 'action', 'participants'],
  ...isNotEmpty('groupJid', 'action'),
};

export const updateSettingsSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    action: {
      type: 'string',
      enum: ['announcement', 'not_announcement', 'locked', 'unlocked'],
    },
  },
  required: ['groupJid', 'action'],
  ...isNotEmpty('groupJid', 'action'),
};

export const toggleEphemeralSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    expiration: {
      type: 'number',
      enum: [0, 86400, 604800, 7776000],
    },
  },
  required: ['groupJid', 'expiration'],
  ...isNotEmpty('groupJid', 'expiration'),
};

export const updateGroupPictureSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    image: { type: 'string' },
  },
  required: ['groupJid', 'image'],
  ...isNotEmpty('groupJid', 'image'),
};

export const updateGroupSubjectSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    subject: { type: 'string' },
  },
  required: ['groupJid', 'subject'],
  ...isNotEmpty('groupJid', 'subject'),
};

export const updateGroupDescriptionSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['groupJid', 'description'],
  ...isNotEmpty('groupJid', 'description'),
};

export const webhookSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    url: { type: 'string' },
    events: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'CALL',
          'NEW_JWT_TOKEN',
        ],
      },
    },
  },
  required: ['url'],
  ...isNotEmpty('url'),
};

export const chatwootSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    account_id: { type: 'string' },
    token: { type: 'string' },
    url: { type: 'string' },
    sign_msg: { type: 'boolean', enum: [true, false] },
    reopen_conversation: { type: 'boolean', enum: [true, false] },
    conversation_pending: { type: 'boolean', enum: [true, false] },
  },
  required: ['enabled', 'account_id', 'token', 'url', 'sign_msg', 'reopen_conversation', 'conversation_pending'],
  ...isNotEmpty('account_id', 'token', 'url', 'sign_msg', 'reopen_conversation', 'conversation_pending'),
};

export const settingsSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    reject_call: { type: 'boolean', enum: [true, false] },
    msg_call: { type: 'string' },
    groups_ignore: { type: 'boolean', enum: [true, false] },
    always_online: { type: 'boolean', enum: [true, false] },
    read_messages: { type: 'boolean', enum: [true, false] },
    read_status: { type: 'boolean', enum: [true, false] },
  },
  required: ['reject_call', 'groups_ignore', 'always_online', 'read_messages', 'read_status'],
  ...isNotEmpty('reject_call', 'groups_ignore', 'always_online', 'read_messages', 'read_status'),
};

export const websocketSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    events: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'CALL',
          'NEW_JWT_TOKEN',
        ],
      },
    },
  },
  required: ['enabled'],
  ...isNotEmpty('enabled'),
};

export const rabbitmqSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    events: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'CALL',
          'NEW_JWT_TOKEN',
        ],
      },
    },
  },
  required: ['enabled'],
  ...isNotEmpty('enabled'),
};

export const typebotSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    url: { type: 'string' },
    typebot: { type: 'string' },
    expire: { type: 'integer' },
    delay_message: { type: 'integer' },
    unknown_message: { type: 'string' },
  },
  required: ['enabled', 'url', 'typebot', 'expire'],
  ...isNotEmpty('enabled', 'url', 'typebot', 'expire'),
};

export const typebotStatusSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    status: { type: 'string', enum: ['opened', 'closed', 'paused'] },
  },
  required: ['remoteJid', 'status'],
  ...isNotEmpty('remoteJid', 'status'),
};

export const typebotStartSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    url: { type: 'string' },
    typebot: { type: 'string' },
  },
  required: ['remoteJid', 'url', 'typebot'],
  ...isNotEmpty('remoteJid', 'url', 'typebot'),
};

export const proxySchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    proxy: { type: 'string' },
  },
  required: ['enabled', 'proxy'],
  ...isNotEmpty('enabled', 'proxy'),
};
