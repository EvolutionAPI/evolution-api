import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { TemplateDto } from '@api/dto/template.dto';
import { templateController } from '@api/server.module';
import { ConfigService } from '@config/env.config';
import { instanceSchema, templateSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';
import { createMetaErrorResponse } from '@utils/errorResponse';

import { HttpStatus } from './index.router';

export class TemplateRouter extends RouterBroker {
  constructor(
    readonly configService: ConfigService,
    ...guards: RequestHandler[]
  ) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        try {
          const response = await this.dataValidate<TemplateDto>({
            request: req,
            schema: templateSchema,
            ClassRef: TemplateDto,
            execute: (instance, data) => templateController.createTemplate(instance, data),
          });

          res.status(HttpStatus.CREATED).json(response);
        } catch (error) {
          // Log error for debugging
          console.error('Template creation error:', error);
          
          // Use utility function to create standardized error response
          const errorResponse = createMetaErrorResponse(error, 'template_creation');
          res.status(errorResponse.status).json(errorResponse);
        }
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        try {
          const response = await this.dataValidate<InstanceDto>({
            request: req,
            schema: instanceSchema,
            ClassRef: InstanceDto,
            execute: (instance) => templateController.findTemplate(instance),
          });

          res.status(HttpStatus.OK).json(response);
        } catch (error) {
          // Log error for debugging
          console.error('Template find error:', error);
          
          // Use utility function to create standardized error response
          const errorResponse = createMetaErrorResponse(error, 'template_find');
          res.status(errorResponse.status).json(errorResponse);
        }
      });
  }

  public readonly router: Router = Router();
}