import { RouterBroker } from '@api/abstract/abstract.router';
import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { OpenaiCredsDto, OpenaiDto, OpenaiSettingDto } from '@api/integrations/chatbot/openai/dto/openai.dto';
import { HttpStatus } from '@api/routes/index.router';
import { openaiController } from '@api/server.module';
import {
  instanceSchema,
  openaiCredsSchema,
  openaiIgnoreJidSchema,
  openaiSchema,
  openaiSettingSchema,
  openaiStatusSchema,
} from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

export class OpenaiRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('creds'), ...guards, async (req, res) => {
        const response = await this.dataValidate<OpenaiCredsDto>({
          request: req,
          schema: openaiCredsSchema,
          ClassRef: OpenaiCredsDto,
          execute: (instance, data) => openaiController.createOpenaiCreds(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('creds'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.findOpenaiCreds(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('creds/:openaiCredsId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.deleteCreds(instance, req.params.openaiCredsId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<OpenaiDto>({
          request: req,
          schema: openaiSchema,
          ClassRef: OpenaiDto,
          execute: (instance, data) => openaiController.createBot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.findBot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetch/:openaiBotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.fetchBot(instance, req.params.openaiBotId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('update/:openaiBotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<OpenaiDto>({
          request: req,
          schema: openaiSchema,
          ClassRef: OpenaiDto,
          execute: (instance, data) => openaiController.updateBot(instance, req.params.openaiBotId, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('delete/:openaiBotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.deleteBot(instance, req.params.openaiBotId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<OpenaiSettingDto>({
          request: req,
          schema: openaiSettingSchema,
          ClassRef: OpenaiSettingDto,
          execute: (instance, data) => openaiController.settings(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.fetchSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('changeStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: openaiStatusSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => openaiController.changeStatus(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSessions/:openaiBotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.fetchSessions(instance, req.params.openaiBotId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('ignoreJid'), ...guards, async (req, res) => {
        const response = await this.dataValidate<IgnoreJidDto>({
          request: req,
          schema: openaiIgnoreJidSchema,
          ClassRef: IgnoreJidDto,
          execute: (instance, data) => openaiController.ignoreJid(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('getModels'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.getModels(instance, req.query.openaiCredsId as string),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
