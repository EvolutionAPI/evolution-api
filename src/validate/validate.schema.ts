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
      required: ['id', 'remoteJid', 'fromMe'],
      ...isNotEmpty('id', 'remoteJid'),
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
  pattern: '^\\d+[\\.@\\w-]+',
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

export const linkPreviewSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    options: { ...optionsSchema },
    linkPreview: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
      ...isNotEmpty('text'),
    },
  },
  required: ['linkPreview', 'number'],
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
        },
        required: ['fullName', 'wuid', 'phoneNumber'],
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
        pattern: '^\\d+',
        description: '"numbers" must be an array of numeric strings',
      },
    },
  },
};

export const readMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    readMessages: {
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
  required: ['readMessages'],
};

export const archiveChatSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
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
  required: ['lastMessage', 'archive'],
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

export const updateGroupPicture: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    groupJid: { type: 'string' },
    image: { type: 'string' },
  },
  required: ['groupJid', 'image'],
  ...isNotEmpty('groupJid', 'image'),
};

// Webhook Schema
export const webhookSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    url: { type: 'string' },
    enabled: { type: 'boolean', enum: [true, false] },
  },
  required: ['url', 'enabled'],
  ...isNotEmpty('url'),
};
