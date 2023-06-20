import { RequestHandler, Router } from 'express';
import {
  audioMessageSchema,
  buttonMessageSchema,
  contactMessageSchema,
  linkPreviewSchema,
  listMessageSchema,
  locationMessageSchema,
  mediaMessageSchema,
  pollMessageSchema,
  reactionMessageSchema,
  stickerMessageSchema,
  textMessageSchema,
} from '../../validate/validate.schema';
import {
  SendAudioDto,
  SendButtonDto,
  SendContactDto,
  SendLinkPreviewDto,
  SendListDto,
  SendLocationDto,
  SendMediaDto,
  SendPollDto,
  SendReactionDto,
  SendStickerDto,
  SendTextDto,
} from '../dto/sendMessage.dto';
import { sendMessageController } from '../whatsapp.module';
import { RouterBroker } from '../abstract/abstract.router';
import { HttpStatus } from './index.router';

export class MessageRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
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
          execute: (instance, data) =>
            sendMessageController.sendWhatsAppAudio(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('sendButtons'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendButtonDto>({
          request: req,
          schema: buttonMessageSchema,
          ClassRef: SendButtonDto,
          execute: (instance, data) => sendMessageController.sendButtons(instance, data),
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
      .post(this.routerPath('sendList'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendListDto>({
          request: req,
          schema: listMessageSchema,
          ClassRef: SendListDto,
          execute: (instance, data) => sendMessageController.sendList(instance, data),
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
      .post(this.routerPath('sendLinkPreview'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SendLinkPreviewDto>({
          request: req,
          schema: linkPreviewSchema,
          ClassRef: SendLinkPreviewDto,
          execute: (instance, data) =>
            sendMessageController.sendLinkPreview(instance, data),
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
      });
  }

  public readonly router = Router();
}
