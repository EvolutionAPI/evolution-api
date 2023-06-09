import { Router } from 'express';
import { Auth, configService } from '../../config/env.config';
import { instanceExistsGuard, instanceLoggedGuard } from '../guards/instance.guard';
import { authGuard } from '../guards/auth.guard';
import { ChatRouter } from './chat.router';
import { GroupRouter } from './group.router';
import { InstanceRouter } from './instance.router';
import { MessageRouter } from './sendMessage.router';
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
const guards = [instanceExistsGuard, instanceLoggedGuard, authGuard[authType]];

router
  .use(
    '/instance',
    new InstanceRouter(configService, ...guards).router,
    new ViewsRouter(instanceExistsGuard).router,
  )
  .use('/message', new MessageRouter(...guards).router)
  .use('/chat', new ChatRouter(...guards).router)
  .use('/group', new GroupRouter(...guards).router)
  .use('/webhook', new WebhookRouter(...guards).router);

export { router, HttpStatus };
