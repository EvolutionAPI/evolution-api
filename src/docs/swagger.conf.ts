import { Router } from 'express';
import { join } from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const document = YAML.load(join(process.cwd(), 'src', 'docs', 'swagger.yaml'));

const router = Router();

export const swaggerRouter = router.use('/docs', swaggerUi.serve).get(
  '/docs',
  swaggerUi.setup(document, {
    customCssUrl: '/css/dark-theme-swagger.css',
    customSiteTitle: 'Evolution API',
    customfavIcon: '/images/logo.svg',
  }),
);
