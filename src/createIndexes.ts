import { configService, Database } from './config/env.config';
import { dbserver } from './libs/db.connect';

(async () => {
  const db = configService.get<Database>('DATABASE');
  const client = dbserver.getClient();
  const connection = client.db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
  const collection = connection.collection('messages');

  await collection.createIndex({ 'key.remoteJid': -1, messageTimestamp: -1 });

  collection.createIndex(
    {
      'message.templateMessage.hydratedFourRowTemplate.hydratedContentText': 'text',
      'message.templateMessage.hydratedFourRowTemplate.hydratedFooterText': 'text',
      'message.templateMessage.hydratedFourRowTemplate.hydratedTitleText': 'text',
      'message.templateMessage.hydratedTemplate.hydratedContentText': 'text',
      'message.templateMessage.hydratedTemplate.hydratedFooterText': 'text',
      'message.templateMessage.hydratedTemplate.hydratedTitleText': 'text',
      'message.conversation': 'text',
      'message.extendedTextMessage.text': 'text',
      'message.imageMessage.caption': 'text',
      'message.videoMessage.caption': 'text',
      'message.stickerMessage.caption': 'text',
      'message.documentMessage.caption': 'text',
      'message.documentWithCaptionMessage.caption': 'text',
      'message.audioMessage.caption': 'text',
      'message.viewOnceMessage.caption': 'text',
      'message.viewOnceMessageV2.caption': 'text',
    },
    {
      default_language: 'none',
    },
  );

  process.exit(0);
})().catch((error) => {
  console.error('An error occurred:', error);
  dbserver.getClient().close();
});
