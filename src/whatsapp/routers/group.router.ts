import { RequestHandler, Router } from 'express';

import { Logger } from '../../config/logger.config';
import {
  createGroupSchema,
  getParticipantsSchema,
  groupInviteSchema,
  groupJidSchema,
  groupSendInviteSchema,
  toggleEphemeralSchema,
  updateGroupDescriptionSchema,
  updateGroupPictureSchema,
  updateGroupSubjectSchema,
  updateParticipantsSchema,
  updateSettingsSchema,
} from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import {
  CreateGroupDto,
  GetParticipant,
  GroupDescriptionDto,
  GroupInvite,
  GroupJid,
  GroupPictureDto,
  GroupSendInvite,
  GroupSubjectDto,
  GroupToggleEphemeralDto,
  GroupUpdateParticipantDto,
  GroupUpdateSettingDto,
} from '../dto/group.dto';
import { groupController } from '../whatsapp.module';
import { HttpStatus } from './index.router';

const logger = new Logger('GroupRouter');

export class GroupRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        logger.verbose('request received in createGroup');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<CreateGroupDto>({
          request: req,
          schema: createGroupSchema,
          ClassRef: CreateGroupDto,
          execute: (instance, data) => groupController.createGroup(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put(this.routerPath('updateGroupSubject'), ...guards, async (req, res) => {
        logger.verbose('request received in updateGroupSubject');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);

        const response = await this.groupValidate<GroupSubjectDto>({
          request: req,
          schema: updateGroupSubjectSchema,
          ClassRef: GroupSubjectDto,
          execute: (instance, data) => groupController.updateGroupSubject(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put(this.routerPath('updateGroupPicture'), ...guards, async (req, res) => {
        logger.verbose('request received in updateGroupPicture');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupPictureDto>({
          request: req,
          schema: updateGroupPictureSchema,
          ClassRef: GroupPictureDto,
          execute: (instance, data) => groupController.updateGroupPicture(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put(this.routerPath('updateGroupDescription'), ...guards, async (req, res) => {
        logger.verbose('request received in updateGroupDescription');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupDescriptionDto>({
          request: req,
          schema: updateGroupDescriptionSchema,
          ClassRef: GroupDescriptionDto,
          execute: (instance, data) => groupController.updateGroupDescription(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('findGroupInfos'), ...guards, async (req, res) => {
        logger.verbose('request received in findGroupInfos');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupJid>({
          request: req,
          schema: groupJidSchema,
          ClassRef: GroupJid,
          execute: (instance, data) => groupController.findGroupInfo(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('fetchAllGroups'), ...guards, async (req, res) => {
        logger.verbose('request received in fetchAllGroups');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.getParticipantsValidate<GetParticipant>({
          request: req,
          schema: getParticipantsSchema,
          ClassRef: GetParticipant,
          execute: (instance, data) => groupController.fetchAllGroups(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('participants'), ...guards, async (req, res) => {
        logger.verbose('request received in participants');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupJid>({
          request: req,
          schema: groupJidSchema,
          ClassRef: GroupJid,
          execute: (instance, data) => groupController.findParticipants(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('inviteCode'), ...guards, async (req, res) => {
        logger.verbose('request received in inviteCode');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupJid>({
          request: req,
          schema: groupJidSchema,
          ClassRef: GroupJid,
          execute: (instance, data) => groupController.inviteCode(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('inviteInfo'), ...guards, async (req, res) => {
        logger.verbose('request received in inviteInfo');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.inviteCodeValidate<GroupInvite>({
          request: req,
          schema: groupInviteSchema,
          ClassRef: GroupInvite,
          execute: (instance, data) => groupController.inviteInfo(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('sendInvite'), ...guards, async (req, res) => {
        logger.verbose('request received in sendInvite');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupNoValidate<GroupSendInvite>({
          request: req,
          schema: groupSendInviteSchema,
          ClassRef: GroupSendInvite,
          execute: (instance, data) => groupController.sendInvite(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .put(this.routerPath('revokeInviteCode'), ...guards, async (req, res) => {
        logger.verbose('request received in revokeInviteCode');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupJid>({
          request: req,
          schema: groupJidSchema,
          ClassRef: GroupJid,
          execute: (instance, data) => groupController.revokeInviteCode(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put(this.routerPath('updateParticipant'), ...guards, async (req, res) => {
        logger.verbose('request received in updateParticipant');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupUpdateParticipantDto>({
          request: req,
          schema: updateParticipantsSchema,
          ClassRef: GroupUpdateParticipantDto,
          execute: (instance, data) => groupController.updateGParticipate(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put(this.routerPath('updateSetting'), ...guards, async (req, res) => {
        logger.verbose('request received in updateSetting');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupUpdateSettingDto>({
          request: req,
          schema: updateSettingsSchema,
          ClassRef: GroupUpdateSettingDto,
          execute: (instance, data) => groupController.updateGSetting(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put(this.routerPath('toggleEphemeral'), ...guards, async (req, res) => {
        logger.verbose('request received in toggleEphemeral');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupToggleEphemeralDto>({
          request: req,
          schema: toggleEphemeralSchema,
          ClassRef: GroupToggleEphemeralDto,
          execute: (instance, data) => groupController.toggleEphemeral(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .delete(this.routerPath('leaveGroup'), ...guards, async (req, res) => {
        logger.verbose('request received in leaveGroup');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.groupValidate<GroupJid>({
          request: req,
          schema: {},
          ClassRef: GroupJid,
          execute: (instance, data) => groupController.leaveGroup(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
