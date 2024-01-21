import { Logger } from '../../config/logger.config';
import {
  AcceptGroupInvite,
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
import { InstanceDto } from '../dto/instance.dto';
import { WAMonitoringService } from '../services/monitor.service';

const logger = new Logger('ChatController');

export class GroupController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async createGroup(instance: InstanceDto, create: CreateGroupDto) {
    logger.verbose('requested createGroup from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].createGroup(create);
  }

  public async updateGroupPicture(instance: InstanceDto, update: GroupPictureDto) {
    logger.verbose('requested updateGroupPicture from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].updateGroupPicture(update);
  }

  public async updateGroupSubject(instance: InstanceDto, update: GroupSubjectDto) {
    logger.verbose('requested updateGroupSubject from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].updateGroupSubject(update);
  }

  public async updateGroupDescription(instance: InstanceDto, update: GroupDescriptionDto) {
    logger.verbose('requested updateGroupDescription from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].updateGroupDescription(update);
  }

  public async findGroupInfo(instance: InstanceDto, groupJid: GroupJid) {
    logger.verbose('requested findGroupInfo from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].findGroup(groupJid);
  }

  public async fetchAllGroups(instance: InstanceDto, getPaticipants: GetParticipant) {
    logger.verbose('requested fetchAllGroups from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].fetchAllGroups(getPaticipants);
  }

  public async inviteCode(instance: InstanceDto, groupJid: GroupJid) {
    logger.verbose('requested inviteCode from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].inviteCode(groupJid);
  }

  public async inviteInfo(instance: InstanceDto, inviteCode: GroupInvite) {
    logger.verbose('requested inviteInfo from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].inviteInfo(inviteCode);
  }

  public async sendInvite(instance: InstanceDto, data: GroupSendInvite) {
    logger.verbose('requested sendInvite from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].sendInvite(data);
  }

  public async acceptInviteCode(instance: InstanceDto, inviteCode: AcceptGroupInvite) {
    logger.verbose('requested acceptInviteCode from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].acceptInviteCode(inviteCode);
  }

  public async revokeInviteCode(instance: InstanceDto, groupJid: GroupJid) {
    logger.verbose('requested revokeInviteCode from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].revokeInviteCode(groupJid);
  }

  public async findParticipants(instance: InstanceDto, groupJid: GroupJid) {
    logger.verbose('requested findParticipants from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].findParticipants(groupJid);
  }

  public async updateGParticipate(instance: InstanceDto, update: GroupUpdateParticipantDto) {
    logger.verbose('requested updateGParticipate from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].updateGParticipant(update);
  }

  public async updateGSetting(instance: InstanceDto, update: GroupUpdateSettingDto) {
    logger.verbose('requested updateGSetting from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].updateGSetting(update);
  }

  public async toggleEphemeral(instance: InstanceDto, update: GroupToggleEphemeralDto) {
    logger.verbose('requested toggleEphemeral from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].toggleEphemeral(update);
  }

  public async leaveGroup(instance: InstanceDto, groupJid: GroupJid) {
    logger.verbose('requested leaveGroup from ' + instance.instanceName + ' instance');
    return await this.waMonitor.waInstances[instance.instanceName].leaveGroup(groupJid);
  }
}
