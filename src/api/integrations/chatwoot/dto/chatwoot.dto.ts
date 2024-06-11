export class ChatwootDto {
  enabled?: boolean;
  accountId?: string;
  token?: string;
  url?: string;
  nameInbox?: string;
  signMsg?: boolean;
  signDelimiter?: string;
  number?: string;
  reopenConversation?: boolean;
  conversationPending?: boolean;
  mergeBrazilContacts?: boolean;
  importContacts?: boolean;
  importMessages?: boolean;
  daysLimitImportMessages?: number;
  autoCreate?: boolean;
  organization?: string;
  logo?: string;
}
