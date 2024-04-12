import { Router } from 'express';
import fs from 'fs';

import { Auth, configService } from '../../config/env.config';
import { authGuard } from '../guards/auth.guard';
import { instanceExistsGuard, instanceLoggedGuard } from '../guards/instance.guard';
import { ChamaaiRouter } from '../integrations/chamaai/routes/chamaai.router';
import { ChatwootRouter } from '../integrations/chatwoot/routes/chatwoot.router';
import { RabbitmqRouter } from '../integrations/rabbitmq/routes/rabbitmq.router';
import { SqsRouter } from '../integrations/sqs/routes/sqs.router';
import { TypebotRouter } from '../integrations/typebot/routes/typebot.router';
import { WebsocketRouter } from '../integrations/websocket/routes/websocket.router';
import { ChatRouter } from './chat.router';
import { GroupRouter } from './group.router';
import { InstanceRouter } from './instance.router';
import { LabelRouter } from './label.router';
import { ProxyRouter } from './proxy.router';
import { MessageRouter } from './sendMessage.router';
import { SettingsRouter } from './settings.router';
import { ViewsRouter } from './view.router';
import { WebhookRouter } from './webhook.router';

enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NOT_FOUND = 404,
  FORBIDDEN = 403,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  INTERNAL_SERVER_ERROR = 500,
}

const router = Router();
const authType = configService.get<Auth>('AUTHENTICATION').TYPE;
const serverConfig = configService.get('SERVER');
const guards = [instanceExistsGuard, instanceLoggedGuard, authGuard[authType]];

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

if (!serverConfig.DISABLE_MANAGER) router.use('/manager', new ViewsRouter().router);

router
  .get('/', (req, res) => {
    res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Welcome to the Evolution API, it is working!',
      version: packageJson.version,
      swagger: !serverConfig.DISABLE_DOCS ? `${req.protocol}://${req.get('host')}/docs` : undefined,
      manager: !serverConfig.DISABLE_MANAGER ? `${req.protocol}://${req.get('host')}/manager` : undefined,
      documentation: `https://doc.evolution-api.com`,
    });
  })
  .use('/instance', new InstanceRouter(configService, ...guards).router)
  .use('/message', new MessageRouter(...guards).router)
  .use('/chat', new ChatRouter(...guards).router)
  .use('/group', new GroupRouter(...guards).router)
  .use('/webhook', new WebhookRouter(configService, ...guards).router)
  .use('/chatwoot', new ChatwootRouter(...guards).router)
  .use('/settings', new SettingsRouter(...guards).router)
  .use('/websocket', new WebsocketRouter(...guards).router)
  .use('/rabbitmq', new RabbitmqRouter(...guards).router)
  .use('/sqs', new SqsRouter(...guards).router)
  .use('/typebot', new TypebotRouter(...guards).router)
  .use('/proxy', new ProxyRouter(...guards).router)
  .use('/chamaai', new ChamaaiRouter(...guards).router)
  .use('/label', new LabelRouter(...guards).router);

export { HttpStatus, router };
