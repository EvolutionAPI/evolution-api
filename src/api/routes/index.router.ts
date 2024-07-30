import { Router } from 'express';
import fs from 'fs';
import mime from 'mime';
import path from 'path';

import { configService, WaBusiness } from '../../config/env.config';
import { authGuard } from '../guards/auth.guard';
import { instanceExistsGuard, instanceLoggedGuard } from '../guards/instance.guard';
import Telemetry from '../guards/telemetry.guard';
import { ChatwootRouter } from '../integrations/chatwoot/routes/chatwoot.router';
import { OpenaiRouter } from '../integrations/openai/routes/openai.router';
import { RabbitmqRouter } from '../integrations/rabbitmq/routes/rabbitmq.router';
import { S3Router } from '../integrations/s3/routes/s3.router';
import { SqsRouter } from '../integrations/sqs/routes/sqs.router';
import { TypebotRouter } from '../integrations/typebot/routes/typebot.router';
import { WebsocketRouter } from '../integrations/websocket/routes/websocket.router';
import { webhookController } from '../server.module';
import { ChatRouter } from './chat.router';
import { GroupRouter } from './group.router';
import { InstanceRouter } from './instance.router';
import { LabelRouter } from './label.router';
import { ProxyRouter } from './proxy.router';
import { MessageRouter } from './sendMessage.router';
import { SettingsRouter } from './settings.router';
import { TemplateRouter } from './template.router';
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
const serverConfig = configService.get('SERVER');
const guards = [instanceExistsGuard, instanceLoggedGuard, authGuard['apikey']];

const telemetry = new Telemetry();

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

if (!serverConfig.DISABLE_MANAGER) router.use('/manager', new ViewsRouter().router);

router.get('/assets/*', (req, res) => {
  const fileName = req.params[0];
  const basePath = path.join(__dirname, '../../../manager/dist');

  const filePath = path.join(basePath, 'assets/', fileName);

  if (fs.existsSync(filePath)) {
    res.set('Content-Type', mime.lookup(filePath) || 'text/css');
    res.send(fs.readFileSync(filePath));
  } else {
    res.status(404).send('File not found');
  }
});

router
  .use((req, res, next) => telemetry.collectTelemetry(req, res, next))

  .get('/', (req, res) => {
    res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Welcome to the Evolution API, it is working!',
      version: packageJson.version,
      manager: !serverConfig.DISABLE_MANAGER ? `${req.protocol}://${req.get('host')}/manager` : undefined,
      documentation: `https://doc.evolution-api.com`,
    });
  })
  .use('/instance', new InstanceRouter(configService, ...guards).router)
  .use('/message', new MessageRouter(...guards).router)
  .use('/chat', new ChatRouter(...guards).router)
  .use('/group', new GroupRouter(...guards).router)
  .use('/webhook', new WebhookRouter(configService, ...guards).router)
  .use('/template', new TemplateRouter(configService, ...guards).router)
  .use('/chatwoot', new ChatwootRouter(...guards).router)
  .use('/settings', new SettingsRouter(...guards).router)
  .use('/websocket', new WebsocketRouter(...guards).router)
  .use('/rabbitmq', new RabbitmqRouter(...guards).router)
  .use('/sqs', new SqsRouter(...guards).router)
  .use('/typebot', new TypebotRouter(...guards).router)
  .use('/proxy', new ProxyRouter(...guards).router)
  .use('/label', new LabelRouter(...guards).router)
  .use('/s3', new S3Router(...guards).router)
  .use('/openai', new OpenaiRouter(...guards).router)
  .get('/webhook/meta', async (req, res) => {
    if (req.query['hub.verify_token'] === configService.get<WaBusiness>('WA_BUSINESS').TOKEN_WEBHOOK)
      res.send(req.query['hub.challenge']);
    else res.send('Error, wrong validation token');
  })
  .post('/webhook/meta', async (req, res) => {
    const { body } = req;
    const response = await webhookController.receiveWebhook(body);

    return res.status(200).json(response);
  });

export { HttpStatus, router };
