import {
  CreateGroupDto,
  GroupInvite,
  GroupJid,
  GroupPictureDto,
  GroupSubjectDto,
  GroupToggleEphemeralDto,
  GroupUpdateParticipantDto,
  GroupUpdateSettingDto,
} from '../dto/group.dto';
import { InstanceDto } from '../dto/instance.dto';
import { WAMonitoringService } from '../services/monitor.service';

export class GroupController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async createGroup(instance: InstanceDto, create: CreateGroupDto) {
    return await this.waMonitor.waInstances[instance.instanceName].createGroup(create);
  }

  public async updateGroupPicture(instance: InstanceDto, update: GroupPictureDto) {
    return await this.waMonitor.waInstances[instance.instanceName].updateGroupPicture(
      update,
    );
  }

  public async updateGroupSubject(instance: InstanceDto, update: GroupSubjectDto) {
    return await this.waMonitor.waInstances[instance.instanceName].updateGroupSubject(
      update,
    );
  }

  public async findGroupInfo(instance: InstanceDto, groupJid: GroupJid) {
    return await this.waMonitor.waInstances[instance.instanceName].findGroup(groupJid);
  }

  public async fetchAllGroups(instance: InstanceDto) {
    return await this.waMonitor.waInstances[instance.instanceName].fetchAllGroups();
  }

  public async inviteCode(instance: InstanceDto, groupJid: GroupJid) {
    return await this.waMonitor.waInstances[instance.instanceName].inviteCode(groupJid);
  }

  public async inviteInfo(instance: InstanceDto, inviteCode: GroupInvite) {
    return await this.waMonitor.waInstances[instance.instanceName].inviteInfo(inviteCode);
  }

  public async revokeInviteCode(instance: InstanceDto, groupJid: GroupJid) {
    return await this.waMonitor.waInstances[instance.instanceName].revokeInviteCode(
      groupJid,
    );
  }

  public async findParticipants(instance: InstanceDto, groupJid: GroupJid) {
    return await this.waMonitor.waInstances[instance.instanceName].findParticipants(
      groupJid,
    );
  }

  public async updateGParticipate(
    instance: InstanceDto,
    update: GroupUpdateParticipantDto,
  ) {
    return await this.waMonitor.waInstances[instance.instanceName].updateGParticipant(
      update,
    );
  }

  public async updateGSetting(instance: InstanceDto, update: GroupUpdateSettingDto) {
    return await this.waMonitor.waInstances[instance.instanceName].updateGSetting(update);
  }

  public async toggleEphemeral(instance: InstanceDto, update: GroupToggleEphemeralDto) {
    return await this.waMonitor.waInstances[instance.instanceName].toggleEphemeral(
      update,
    );
  }

  public async leaveGroup(instance: InstanceDto, groupJid: GroupJid) {
    return await this.waMonitor.waInstances[instance.instanceName].leaveGroup(groupJid);
  }
}
