import { RequestHandler, Router } from 'express';

import {
  audioMessageSchema,
  contactMessageSchema,
  listMessageSchema,
  locationMessageSchema,
  mediaMessageSchema,
  pollMessageSchema,
  reactionMessageSchema,
  statusMessageSchema,
  stickerMessageSchema,
  templateMessageSchema,
  textMessageSchema,
} from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import {
  SendAudioDto,
  SendContactDto,
  SendListDto,
  SendLocationDto,
  SendMediaDto,
  SendPollDto,
  SendReactionDto,
  SendStatusDto,
  SendStickerDto,
  SendTemplateDto,
  SendTextDto,
} from '../dto/sendMessage.dto';
import { sendMessageController } from '../server.module';
import { HttpStatus } from './index.router';

export class MessageRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('sendTemplate'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendTemplateDto>({
          request: req,
          schema: templateMessageSchema,
          ClassRef: SendTemplateDto,
          execute: (instance, data) => sendMessageController.sendTemplate(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendText'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendTextDto>({
          request: req,
          schema: textMessageSchema,
          ClassRef: SendTextDto,
          execute: (instance, data) => sendMessageController.sendText(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendMedia'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendMediaDto>({
          request: req,
          schema: mediaMessageSchema,
          ClassRef: SendMediaDto,
          execute: (instance, data) => sendMessageController.sendMedia(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendWhatsAppAudio'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendAudioDto>({
          request: req,
          schema: audioMessageSchema,
          ClassRef: SendMediaDto,
          execute: (instance, data) => sendMessageController.sendWhatsAppAudio(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      // TODO: Revisar funcionamento do envio de Status
      .post(this.routerPath('sendStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendStatusDto>({
          request: req,
          schema: statusMessageSchema,
          ClassRef: SendStatusDto,
          execute: (instance, data) => sendMessageController.sendStatus(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendSticker'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendStickerDto>({
          request: req,
          schema: stickerMessageSchema,
          ClassRef: SendStickerDto,
          execute: (instance, data) => sendMessageController.sendSticker(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendLocation'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendLocationDto>({
          request: req,
          schema: locationMessageSchema,
          ClassRef: SendLocationDto,
          execute: (instance, data) => sendMessageController.sendLocation(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendContact'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendContactDto>({
          request: req,
          schema: contactMessageSchema,
          ClassRef: SendContactDto,
          execute: (instance, data) => sendMessageController.sendContact(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendReaction'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendReactionDto>({
          request: req,
          schema: reactionMessageSchema,
          ClassRef: SendReactionDto,
          execute: (instance, data) => sendMessageController.sendReaction(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendPoll'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendPollDto>({
          request: req,
          schema: pollMessageSchema,
          ClassRef: SendPollDto,
          execute: (instance, data) => sendMessageController.sendPoll(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendList'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendListDto>({
          request: req,
          schema: listMessageSchema,
          ClassRef: SendListDto,
          execute: (instance, data) => sendMessageController.sendList(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      });
    // .post(this.routerPath('sendButtons'), ...guards, async (req, res) => {
    //   const response = await this.dataValidate<SendButtonDto>({
    //     request: req,
    //     schema: buttonMessageSchema,
    //     ClassRef: SendButtonDto,
    //     execute: (instance, data) => sendMessageController.sendButtons(instance, data),
    //   });

    //   return res.status(HttpStatus.CREATED).json(response);
    // })
  }

  public readonly router = Router();
}
