import { ChatwootRouter } from '@api/integrations/chatbot/chatwoot/routes/chatwoot.router';
import { DifyRouter } from '@api/integrations/chatbot/dify/routes/dify.router';
import { OpenaiRouter } from '@api/integrations/chatbot/openai/routes/openai.router';
import { TypebotRouter } from '@api/integrations/chatbot/typebot/routes/typebot.router';
import { Router } from 'express';

import { GenericRouter } from './generic/routes/generic.router';

export class ChatbotRouter {
  public readonly router: Router;

  constructor(...guards: any[]) {
    this.router = Router();

    this.router.use('/chatwoot', new ChatwootRouter(...guards).router);
    this.router.use('/typebot', new TypebotRouter(...guards).router);
    this.router.use('/openai', new OpenaiRouter(...guards).router);
    this.router.use('/dify', new DifyRouter(...guards).router);
    this.router.use('/generic', new GenericRouter(...guards).router);
  }
}
