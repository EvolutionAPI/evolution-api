import { RouterBroker } from '@api/abstract/abstract.router';
import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { DifyDto, DifySettingDto } from '@api/integrations/chatbot/dify/dto/dify.dto';
import { HttpStatus } from '@api/routes/index.router';
import { difyController } from '@api/server.module';
import {
  difyIgnoreJidSchema,
  difySchema,
  difySettingSchema,
  difyStatusSchema,
  instanceSchema,
} from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

export class DifyRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<DifyDto>({
          request: req,
          schema: difySchema,
          ClassRef: DifyDto,
          execute: (instance, data) => difyController.createBot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.findBot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetch/:difyId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.fetchBot(instance, req.params.difyId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('update/:difyId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<DifyDto>({
          request: req,
          schema: difySchema,
          ClassRef: DifyDto,
          execute: (instance, data) => difyController.updateBot(instance, req.params.difyId, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('delete/:difyId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.deleteBot(instance, req.params.difyId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<DifySettingDto>({
          request: req,
          schema: difySettingSchema,
          ClassRef: DifySettingDto,
          execute: (instance, data) => difyController.settings(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.fetchSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('changeStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: difyStatusSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => difyController.changeStatus(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSessions/:difyId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.fetchSessions(instance, req.params.difyId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('ignoreJid'), ...guards, async (req, res) => {
        const response = await this.dataValidate<IgnoreJidDto>({
          request: req,
          schema: difyIgnoreJidSchema,
          ClassRef: IgnoreJidDto,
          execute: (instance, data) => difyController.ignoreJid(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
