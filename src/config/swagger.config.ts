import { configService, HttpServer } from '@config/env.config';
import { Request } from 'express';
import fs from 'fs';

type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, unknown>;
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: string;
        in: string;
        name: string;
      };
    };
  };
};

function getBaseUrl(req: Request): string {
  const configuredServerUrl = configService.get<HttpServer>('SERVER').URL;
  if (configuredServerUrl) {
    return configuredServerUrl;
  }

  return `${req.protocol}://${req.get('host')}`;
}

export function getSwaggerDocument(req: Request): OpenApiDocument {
  const baseUrl = getBaseUrl(req);
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

  return {
    openapi: '3.0.3',
    info: {
      title: 'Evolution API',
      description:
        'Local Swagger documentation for your Evolution API instance. Use this UI for direct endpoint testing on your server.',
      version: packageJson.version,
    },
    servers: [{ url: baseUrl, description: 'Current server' }],
    tags: [
      { name: 'Server', description: 'General server and utility endpoints' },
      { name: 'Instance', description: 'Instance lifecycle endpoints' },
      { name: 'Message', description: 'Message sending and messaging operations' },
      { name: 'Group', description: 'Group management endpoints' },
      { name: 'Chat', description: 'Chat operations' },
      { name: 'Settings', description: 'Instance and integration settings' },
      { name: 'Integrations', description: 'Channel, chatbot, event and storage integrations' },
    ],
    paths: {
      '/': {
        get: {
          tags: ['Server'],
          summary: 'Get API information',
          responses: {
            '200': {
              description: 'API status information',
            },
          },
        },
      },
      '/verify-creds': {
        post: {
          tags: ['Server'],
          summary: 'Verify configured credentials',
          security: [{ ApiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Credentials are valid',
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'apikey',
        },
      },
    },
  };
}
