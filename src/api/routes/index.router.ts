import { authGuard } from '@api/guards/auth.guard';
import { instanceExistsGuard, instanceLoggedGuard } from '@api/guards/instance.guard';
import Telemetry from '@api/guards/telemetry.guard';
import { ChannelRouter } from '@api/integrations/channel/channel.router';
import { ChatbotRouter } from '@api/integrations/chatbot/chatbot.router';
import { EventRouter } from '@api/integrations/event/event.router';
import { StorageRouter } from '@api/integrations/storage/storage.router';
import { configService } from '@config/env.config';
import { waMonitor } from '@api/server.module';
import { fetchLatestWaWebVersion } from '@utils/fetchLatestWaWebVersion';
import { Router } from 'express';
import fs from 'fs';
import mimeTypes from 'mime-types';
import path from 'path';

import { BusinessRouter } from './business.router';
import { CallRouter } from './call.router';
import { ChatRouter } from './chat.router';
import { GroupRouter } from './group.router';
import { InstanceRouter } from './instance.router';
import { LabelRouter } from './label.router';
import { ProxyRouter } from './proxy.router';
import { MessageRouter } from './sendMessage.router';
import { SettingsRouter } from './settings.router';
import { TemplateRouter } from './template.router';
import { ViewsRouter } from './view.router';

enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NOT_FOUND = 404,
  FORBIDDEN = 403,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  INTERNAL_SERVER_ERROR = 500,
}

const router: Router = Router();
const serverConfig = configService.get('SERVER');
const guards = [instanceExistsGuard, instanceLoggedGuard, authGuard['apikey']];

const telemetry = new Telemetry();

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Expose Prometheus metrics when enabled by env flag
if (process.env.PROMETHEUS_METRICS === 'true') {
  router.get('/metrics', async (req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    const escapeLabel = (value: unknown) =>
      String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/"/g, '\\"');

    const lines: string[] = [];

    const clientName = process.env.DATABASE_CONNECTION_CLIENT_NAME || '';
    const serverUrl = serverConfig.URL || '';

    // environment info
    lines.push('# HELP evolution_environment_info Environment information');
    lines.push('# TYPE evolution_environment_info gauge');
    lines.push(
      `evolution_environment_info{version="${escapeLabel(packageJson.version)}",clientName="${escapeLabel(
        clientName,
      )}",serverUrl="${escapeLabel(serverUrl)}"} 1`,
    );

    const instances = (waMonitor && waMonitor.waInstances) || {};
    const instanceEntries = Object.entries(instances);

    // total instances
    lines.push('# HELP evolution_instances_total Total number of instances');
    lines.push('# TYPE evolution_instances_total gauge');
    lines.push(`evolution_instances_total ${instanceEntries.length}`);

    // per-instance status
    lines.push('# HELP evolution_instance_up 1 if instance state is open, else 0');
    lines.push('# TYPE evolution_instance_up gauge');
    lines.push('# HELP evolution_instance_state Instance state as a labelled metric');
    lines.push('# TYPE evolution_instance_state gauge');

    for (const [name, instance] of instanceEntries) {
      const state = instance?.connectionStatus?.state || 'unknown';
      const integration = instance?.integration || '';
      const up = state === 'open' ? 1 : 0;

      lines.push(
        `evolution_instance_up{instance="${escapeLabel(name)}",integration="${escapeLabel(integration)}"} ${up}`,
      );
      lines.push(
        `evolution_instance_state{instance="${escapeLabel(name)}",integration="${escapeLabel(
          integration,
        )}",state="${escapeLabel(state)}"} 1`,
      );
    }

    res.send(lines.join('\n') + '\n');
  });
}

if (!serverConfig.DISABLE_MANAGER) router.use('/manager', new ViewsRouter().router);

router.get('/assets/*', (req, res) => {
  const fileName = req.params[0];
  const basePath = path.join(process.cwd(), 'manager', 'dist');

  const filePath = path.join(basePath, 'assets/', fileName);

  if (fs.existsSync(filePath)) {
    res.set('Content-Type', mimeTypes.lookup(filePath) || 'text/css');
    res.send(fs.readFileSync(filePath));
  } else {
    res.status(404).send('File not found');
  }
});

router
  .use((req, res, next) => telemetry.collectTelemetry(req, res, next))

  .get('/', async (req, res) => {
    res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Welcome to the Evolution API, it is working!',
      version: packageJson.version,
      clientName: process.env.DATABASE_CONNECTION_CLIENT_NAME,
      manager: !serverConfig.DISABLE_MANAGER ? `${req.protocol}://${req.get('host')}/manager` : undefined,
      documentation: `https://doc.evolution-api.com`,
      whatsappWebVersion: (await fetchLatestWaWebVersion({})).version.join('.'),
    });
  })
  .post('/verify-creds', authGuard['apikey'], async (req, res) => {
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Credentials are valid',
      facebookAppId: process.env.FACEBOOK_APP_ID,
      facebookConfigId: process.env.FACEBOOK_CONFIG_ID,
      facebookUserToken: process.env.FACEBOOK_USER_TOKEN,
    });
  })
  .use('/instance', new InstanceRouter(configService, ...guards).router)
  .use('/message', new MessageRouter(...guards).router)
  .use('/call', new CallRouter(...guards).router)
  .use('/chat', new ChatRouter(...guards).router)
  .use('/business', new BusinessRouter(...guards).router)
  .use('/group', new GroupRouter(...guards).router)
  .use('/template', new TemplateRouter(configService, ...guards).router)
  .use('/settings', new SettingsRouter(...guards).router)
  .use('/proxy', new ProxyRouter(...guards).router)
  .use('/label', new LabelRouter(...guards).router)
  .use('', new ChannelRouter(configService, ...guards).router)
  .use('', new EventRouter(configService, ...guards).router)
  .use('', new ChatbotRouter(...guards).router)
  .use('', new StorageRouter(...guards).router);

export { HttpStatus, router };
