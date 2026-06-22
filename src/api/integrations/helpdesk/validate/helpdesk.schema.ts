import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

export const tenantSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
  },
  required: ['name'],
};

export const customerSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    phoneNumber: { type: 'string', minLength: 1 },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    tenantId: { type: 'string', minLength: 1 },
  },
  required: ['phoneNumber', 'tenantId'],
};

export const ticketSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    subject: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] },
    category: { type: 'string' },
    source: { type: 'string' },
    tenantId: { type: 'string', minLength: 1 },
    customerId: { type: 'string', minLength: 1 },
  },
  required: ['subject', 'tenantId', 'customerId'],
};

export const ticketUpdateSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    subject: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] },
    category: { type: 'string' },
  },
};

export const instanceTenantSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    tenantId: { type: 'string', minLength: 1 },
  },
  required: ['tenantId'],
};

export const ticketMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    content: { type: 'string', minLength: 1 },
    fromWhatsApp: { type: 'boolean' },
  },
  required: ['content'],
};
