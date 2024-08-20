import { prismaRepository, waMonitor } from '@api/server.module';
import { configService } from '@config/env.config';

import { DifyController } from './chatbot/dify/controllers/dify.controller';
import { DifyService } from './chatbot/dify/services/dify.service';
import { OpenaiController } from './chatbot/openai/controllers/openai.controller';
import { OpenaiService } from './chatbot/openai/services/openai.service';
import { TypebotController } from './chatbot/typebot/controllers/typebot.controller';
import { TypebotService } from './chatbot/typebot/services/typebot.service';
import { RabbitmqController } from './event/rabbitmq/controllers/rabbitmq.controller';
import { SqsController } from './event/sqs/controllers/sqs.controller';
import { WebhookController } from './event/webhook/controllers/webhook.controller';
import { WebsocketController } from './event/websocket/controllers/websocket.controller';

// events
export const websocketController = new WebsocketController(prismaRepository, waMonitor);
export const rabbitmqController = new RabbitmqController(prismaRepository, waMonitor);
export const sqsController = new SqsController(prismaRepository, waMonitor);
export const webhookController = new WebhookController(prismaRepository, waMonitor);

// chatbots
const typebotService = new TypebotService(waMonitor, configService, prismaRepository);
export const typebotController = new TypebotController(typebotService);

const openaiService = new OpenaiService(waMonitor, configService, prismaRepository);
export const openaiController = new OpenaiController(openaiService);

const difyService = new DifyService(waMonitor, configService, prismaRepository);
export const difyController = new DifyController(difyService);
