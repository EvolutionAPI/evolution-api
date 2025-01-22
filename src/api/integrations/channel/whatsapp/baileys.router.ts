import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { baileysController } from '@api/server.module';
import { instanceSchema } from '@validate/instance.schema';
import { RequestHandler, Router } from 'express';

export class BaileysRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('onWhatsapp'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.onWhatsapp(instance, req.body),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('profilePictureUrl'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.profilePictureUrl(instance, req.body),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('assertSessions'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.assertSessions(instance, req.body),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('createParticipantNodes'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.createParticipantNodes(instance, req.body),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('getUSyncDevices'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.getUSyncDevices(instance, req.body),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('generateMessageTag'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.generateMessageTag(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('sendNode'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.sendNode(instance, req.body),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('signalRepositoryDecryptMessage'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.signalRepositoryDecryptMessage(instance, req.body),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('getAuthState'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => baileysController.getAuthState(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
