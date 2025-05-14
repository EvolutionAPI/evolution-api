import { RouterBroker } from '@api/abstract/abstract.router';
import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { n8nController } from '@api/server.module';
import {
  instanceSchema,
  n8nIgnoreJidSchema,
  n8nSchema,
  n8nSettingSchema,
  n8nStatusSchema,
} from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

import { N8nDto, N8nSettingDto } from '../dto/n8n.dto';

export class N8nRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<N8nDto>({
          request: req,
          schema: n8nSchema,
          ClassRef: N8nDto,
          execute: (instance, data) => n8nController.createBot(instance, data),
        });
        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => n8nController.findBot(instance),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetch/:n8nId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => n8nController.fetchBot(instance, req.params.n8nId),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('update/:n8nId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<N8nDto>({
          request: req,
          schema: n8nSchema,
          ClassRef: N8nDto,
          execute: (instance, data) => n8nController.updateBot(instance, req.params.n8nId, data),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('delete/:n8nId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => n8nController.deleteBot(instance, req.params.n8nId),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<N8nSettingDto>({
          request: req,
          schema: n8nSettingSchema,
          ClassRef: N8nSettingDto,
          execute: (instance, data) => n8nController.settings(instance, data),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => n8nController.fetchSettings(instance),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('changeStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: n8nStatusSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => n8nController.changeStatus(instance, data),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSessions/:n8nId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => n8nController.fetchSessions(instance, req.params.n8nId),
        });
        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('ignoreJid'), ...guards, async (req, res) => {
        const response = await this.dataValidate<IgnoreJidDto>({
          request: req,
          schema: n8nIgnoreJidSchema,
          ClassRef: IgnoreJidDto,
          execute: (instance, data) => n8nController.ignoreJid(instance, data),
        });
        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
