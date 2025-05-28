import { RouterBroker } from '@api/abstract/abstract.router';
import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { evoaiController } from '@api/server.module';
import {
  evoaiIgnoreJidSchema,
  evoaiSchema,
  evoaiSettingSchema,
  evoaiStatusSchema,
  instanceSchema,
} from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

import { EvoaiDto, EvoaiSettingDto } from '../dto/evoai.dto';

export class EvoaiRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<EvoaiDto>({
          request: req,
          schema: evoaiSchema,
          ClassRef: EvoaiDto,
          execute: (instance, data) => evoaiController.createBot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => evoaiController.findBot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetch/:evoaiId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => evoaiController.fetchBot(instance, req.params.evoaiId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('update/:evoaiId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<EvoaiDto>({
          request: req,
          schema: evoaiSchema,
          ClassRef: EvoaiDto,
          execute: (instance, data) => evoaiController.updateBot(instance, req.params.evoaiId, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('delete/:evoaiId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => evoaiController.deleteBot(instance, req.params.evoaiId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<EvoaiSettingDto>({
          request: req,
          schema: evoaiSettingSchema,
          ClassRef: EvoaiSettingDto,
          execute: (instance, data) => evoaiController.settings(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => evoaiController.fetchSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('changeStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: evoaiStatusSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => evoaiController.changeStatus(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSessions/:evoaiId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => evoaiController.fetchSessions(instance, req.params.evoaiId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('ignoreJid'), ...guards, async (req, res) => {
        const response = await this.dataValidate<IgnoreJidDto>({
          request: req,
          schema: evoaiIgnoreJidSchema,
          ClassRef: IgnoreJidDto,
          execute: (instance, data) => evoaiController.ignoreJid(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
