import { RouterBroker } from '@api/abstract/abstract.router';
import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { flowiseController } from '@api/server.module';
import { instanceSchema } from '@validate/instance.schema';
import { RequestHandler, Router } from 'express';

import { FlowiseDto, FlowiseSettingDto } from '../dto/flowise.dto';
import {
  flowiseIgnoreJidSchema,
  flowiseSchema,
  flowiseSettingSchema,
  flowiseStatusSchema,
} from '../validate/flowise.schema';

export class FlowiseRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<FlowiseDto>({
          request: req,
          schema: flowiseSchema,
          ClassRef: FlowiseDto,
          execute: (instance, data) => flowiseController.createBot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => flowiseController.findBot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetch/:flowiseId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => flowiseController.fetchBot(instance, req.params.flowiseId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('update/:flowiseId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<FlowiseDto>({
          request: req,
          schema: flowiseSchema,
          ClassRef: FlowiseDto,
          execute: (instance, data) => flowiseController.updateBot(instance, req.params.flowiseId, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('delete/:flowiseId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => flowiseController.deleteBot(instance, req.params.flowiseId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<FlowiseSettingDto>({
          request: req,
          schema: flowiseSettingSchema,
          ClassRef: FlowiseSettingDto,
          execute: (instance, data) => flowiseController.settings(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => flowiseController.fetchSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('changeStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: flowiseStatusSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => flowiseController.changeStatus(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSessions/:flowiseId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => flowiseController.fetchSessions(instance, req.params.flowiseId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('ignoreJid'), ...guards, async (req, res) => {
        const response = await this.dataValidate<IgnoreJidDto>({
          request: req,
          schema: flowiseIgnoreJidSchema,
          ClassRef: IgnoreJidDto,
          execute: (instance, data) => flowiseController.ignoreJid(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
