import { Contact, Message, MessageUpdate } from '@prisma/client';
import { RequestHandler, Router } from 'express';

import {
  archiveChatSchema,
  blockUserSchema,
  contactValidateSchema,
  deleteMessageSchema,
  markChatUnreadSchema,
  messageUpSchema,
  messageValidateSchema,
  presenceSchema,
  privacySettingsSchema,
  profileNameSchema,
  profilePictureSchema,
  profileSchema,
  profileStatusSchema,
  readMessageSchema,
  updateMessageSchema,
  whatsappNumberSchema,
} from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import {
  ArchiveChatDto,
  BlockUserDto,
  DeleteMessage,
  getBase64FromMediaMessageDto,
  MarkChatUnreadDto,
  NumberDto,
  PrivacySettingDto,
  ProfileNameDto,
  ProfilePictureDto,
  ProfileStatusDto,
  ReadMessageDto,
  SendPresenceDto,
  UpdateMessageDto,
  WhatsAppNumberDto,
} from '../dto/chat.dto';
import { InstanceDto } from '../dto/instance.dto';
import { Query } from '../repository/repository.service';
import { chatController } from '../server.module';
import { HttpStatus } from './index.router';

export class ChatRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('whatsappNumbers'), ...guards, async (req, res) => {
        const response = await this.dataValidate<WhatsAppNumberDto>({
          request: req,
          schema: whatsappNumberSchema,
          ClassRef: WhatsAppNumberDto,
          execute: (instance, data) => chatController.whatsappNumber(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('markMessageAsRead'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ReadMessageDto>({
          request: req,
          schema: readMessageSchema,
          ClassRef: ReadMessageDto,
          execute: (instance, data) => chatController.readMessage(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('archiveChat'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ArchiveChatDto>({
          request: req,
          schema: archiveChatSchema,
          ClassRef: ArchiveChatDto,
          execute: (instance, data) => chatController.archiveChat(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('markChatUnread'), ...guards, async (req, res) => {
        const response = await this.dataValidate<MarkChatUnreadDto>({
          request: req,
          schema: markChatUnreadSchema,
          ClassRef: MarkChatUnreadDto,
          execute: (instance, data) => chatController.markChatUnread(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .delete(this.routerPath('deleteMessageForEveryone'), ...guards, async (req, res) => {
        const response = await this.dataValidate<DeleteMessage>({
          request: req,
          schema: deleteMessageSchema,
          ClassRef: DeleteMessage,
          execute: (instance, data) => chatController.deleteMessage(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('fetchProfilePictureUrl'), ...guards, async (req, res) => {
        const response = await this.dataValidate<NumberDto>({
          request: req,
          schema: profilePictureSchema,
          ClassRef: NumberDto,
          execute: (instance, data) => chatController.fetchProfilePicture(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('getBase64FromMediaMessage'), ...guards, async (req, res) => {
        const response = await this.dataValidate<getBase64FromMediaMessageDto>({
          request: req,
          schema: null,
          ClassRef: getBase64FromMediaMessageDto,
          execute: (instance, data) => chatController.getBase64FromMediaMessage(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('updateMessage'), ...guards, async (req, res) => {
        const response = await this.dataValidate<UpdateMessageDto>({
          request: req,
          schema: updateMessageSchema,
          ClassRef: UpdateMessageDto,
          execute: (instance, data) => chatController.updateMessage(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('sendPresence'), ...guards, async (req, res) => {
        const response = await this.dataValidate<null>({
          request: req,
          schema: presenceSchema,
          ClassRef: SendPresenceDto,
          execute: (instance, data) => chatController.sendPresence(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('updateBlockStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<BlockUserDto>({
          request: req,
          schema: blockUserSchema,
          ClassRef: BlockUserDto,
          execute: (instance, data) => chatController.blockUser(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('findContacts'), ...guards, async (req, res) => {
        const response = await this.dataValidate<Query<Contact>>({
          request: req,
          schema: contactValidateSchema,
          ClassRef: Query<Contact>,
          execute: (instance, data) => chatController.fetchContacts(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('findMessages'), ...guards, async (req, res) => {
        const response = await this.dataValidate<Query<Message>>({
          request: req,
          schema: messageValidateSchema,
          ClassRef: Query<Message>,
          execute: (instance, data) => chatController.fetchMessages(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('findStatusMessage'), ...guards, async (req, res) => {
        const response = await this.dataValidate<Query<MessageUpdate>>({
          request: req,
          schema: messageUpSchema,
          ClassRef: Query<MessageUpdate>,
          execute: (instance, data) => chatController.fetchStatusMessage(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('findChats'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: null,
          ClassRef: InstanceDto,
          execute: (instance) => chatController.fetchChats(instance),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      // Profile routes
      .post(this.routerPath('fetchBusinessProfile'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ProfilePictureDto>({
          request: req,
          schema: profilePictureSchema,
          ClassRef: ProfilePictureDto,
          execute: (instance, data) => chatController.fetchBusinessProfile(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('fetchProfile'), ...guards, async (req, res) => {
        const response = await this.dataValidate<NumberDto>({
          request: req,
          schema: profileSchema,
          ClassRef: NumberDto,
          execute: (instance, data) => chatController.fetchProfile(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })

      .post(this.routerPath('updateProfileName'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ProfileNameDto>({
          request: req,
          schema: profileNameSchema,
          ClassRef: ProfileNameDto,
          execute: (instance, data) => chatController.updateProfileName(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('updateProfileStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ProfileStatusDto>({
          request: req,
          schema: profileStatusSchema,
          ClassRef: ProfileStatusDto,
          execute: (instance, data) => chatController.updateProfileStatus(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('updateProfilePicture'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ProfilePictureDto>({
          request: req,
          schema: profilePictureSchema,
          ClassRef: ProfilePictureDto,
          execute: (instance, data) => chatController.updateProfilePicture(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('removeProfilePicture'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ProfilePictureDto>({
          request: req,
          schema: profilePictureSchema,
          ClassRef: ProfilePictureDto,
          execute: (instance) => chatController.removeProfilePicture(instance),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchPrivacySettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: null,
          ClassRef: InstanceDto,
          execute: (instance) => chatController.fetchPrivacySettings(instance),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('updatePrivacySettings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<PrivacySettingDto>({
          request: req,
          schema: privacySettingsSchema,
          ClassRef: PrivacySettingDto,
          execute: (instance, data) => chatController.updatePrivacySettings(instance, data),
        });

        return res.status(HttpStatus.CREATED).json(response);
      });
  }

  public readonly router = Router();
}
