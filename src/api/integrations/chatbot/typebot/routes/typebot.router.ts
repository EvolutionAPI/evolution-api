import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { TypebotDto, TypebotIgnoreJidDto, TypebotSettingDto } from '@api/integrations/chatbot/typebot/dto/typebot.dto';
import { typebotController } from '@api/server.module';
import { HttpStatus } from '@api/routes/index.router';
import {
  instanceSchema,
  typebotIgnoreJidSchema,
  typebotSchema,
  typebotSettingSchema,
  typebotStartSchema,
  typebotStatusSchema,
} from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

export class TypebotRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<TypebotDto>({
          request: req,
          schema: typebotSchema,
          ClassRef: TypebotDto,
          execute: (instance, data) => typebotController.createTypebot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => typebotController.findTypebot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetch/:typebotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => typebotController.fetchTypebot(instance, req.params.typebotId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('update/:typebotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<TypebotDto>({
          request: req,
          schema: typebotSchema,
          ClassRef: TypebotDto,
          execute: (instance, data) => typebotController.updateTypebot(instance, req.params.typebotId, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('delete/:typebotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => typebotController.deleteTypebot(instance, req.params.typebotId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<TypebotSettingDto>({
          request: req,
          schema: typebotSettingSchema,
          ClassRef: TypebotSettingDto,
          execute: (instance, data) => typebotController.settings(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => typebotController.fetchSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('start'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: typebotStartSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => typebotController.startTypebot(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('changeStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: typebotStatusSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => typebotController.changeStatus(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchSessions/:typebotId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => typebotController.fetchSessions(instance, req.params.typebotId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('ignoreJid'), ...guards, async (req, res) => {
        const response = await this.dataValidate<TypebotIgnoreJidDto>({
          request: req,
          schema: typebotIgnoreJidSchema,
          ClassRef: TypebotIgnoreJidDto,
          execute: (instance, data) => typebotController.ignoreJid(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
