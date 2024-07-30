import { RequestHandler, Router } from 'express';

import {
  difyIgnoreJidSchema,
  difySchema,
  difySettingSchema,
  difyStatusSchema,
  instanceSchema,
} from '../../../../validate/validate.schema';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { difyController } from '../../../server.module';
import { DifyDto, DifyIgnoreJidDto, DifySettingDto } from '../dto/dify.dto';

export class DifyRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<DifyDto>({
          request: req,
          schema: difySchema,
          ClassRef: DifyDto,
          execute: (instance, data) => difyController.createDify(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.findDify(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetch/:difyId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.fetchDify(instance, req.params.difyId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('update/:difyId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<DifyDto>({
          request: req,
          schema: difySchema,
          ClassRef: DifyDto,
          execute: (instance, data) => difyController.updateDify(instance, req.params.difyId, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('delete/:difyId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => difyController.deleteDify(instance, req.params.difyId),
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
        const response = await this.dataValidate<DifyIgnoreJidDto>({
          request: req,
          schema: difyIgnoreJidSchema,
          ClassRef: DifyIgnoreJidDto,
          execute: (instance, data) => difyController.ignoreJid(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
