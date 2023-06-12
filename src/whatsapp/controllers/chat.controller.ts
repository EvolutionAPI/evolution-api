import { proto } from '@evolution/base';
import {
  ArchiveChatDto,
  DeleteMessage,
  NumberDto,
  PrivacySettingDto,
  ProfileNameDto,
  ProfilePictureDto,
  ProfileStatusDto,
  ReadMessageDto,
  WhatsAppNumberDto,
} from '../dto/chat.dto';
import { InstanceDto } from '../dto/instance.dto';
import { ContactQuery } from '../repository/contact.repository';
import { MessageQuery } from '../repository/message.repository';
import { MessageUpQuery } from '../repository/messageUp.repository';
import { WAMonitoringService } from '../services/monitor.service';

export class ChatController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async whatsappNumber({ instanceName }: InstanceDto, data: WhatsAppNumberDto) {
    return await this.waMonitor.waInstances[instanceName].whatsappNumber(data);
  }

  public async readMessage({ instanceName }: InstanceDto, data: ReadMessageDto) {
    return await this.waMonitor.waInstances[instanceName].markMessageAsRead(data);
  }

  public async archiveChat({ instanceName }: InstanceDto, data: ArchiveChatDto) {
    return await this.waMonitor.waInstances[instanceName].archiveChat(data);
  }

  public async deleteMessage({ instanceName }: InstanceDto, data: DeleteMessage) {
    return await this.waMonitor.waInstances[instanceName].deleteMessage(data);
  }

  public async fetchProfilePicture({ instanceName }: InstanceDto, data: NumberDto) {
    return await this.waMonitor.waInstances[instanceName].profilePicture(data.number);
  }

  public async fetchContacts({ instanceName }: InstanceDto, query: ContactQuery) {
    return await this.waMonitor.waInstances[instanceName].fetchContacts(query);
  }

  public async getBase64FromMediaMessage(
    { instanceName }: InstanceDto,
    message: proto.IWebMessageInfo,
  ) {
    return await this.waMonitor.waInstances[instanceName].getBase64FromMediaMessage(
      message,
    );
  }

  public async fetchMessages({ instanceName }: InstanceDto, query: MessageQuery) {
    return await this.waMonitor.waInstances[instanceName].fetchMessages(query);
  }

  public async fetchStatusMessage({ instanceName }: InstanceDto, query: MessageUpQuery) {
    return await this.waMonitor.waInstances[instanceName].fetchStatusMessage(query);
  }

  public async fetchChats({ instanceName }: InstanceDto) {
    return await this.waMonitor.waInstances[instanceName].fetchChats();
  }

  public async fetchPrivacySettings({ instanceName }: InstanceDto) {
    return await this.waMonitor.waInstances[instanceName].fetchPrivacySettings();
  }

  public async updatePrivacySettings(
    { instanceName }: InstanceDto,
    data: PrivacySettingDto,
  ) {
    return await this.waMonitor.waInstances[instanceName].updatePrivacySettings(data);
  }

  public async fetchBusinessProfile(
    { instanceName }: InstanceDto,
    data: ProfilePictureDto,
  ) {
    return await this.waMonitor.waInstances[instanceName].fetchBusinessProfile(
      data.number,
    );
  }

  public async updateProfileName({ instanceName }: InstanceDto, data: ProfileNameDto) {
    return await this.waMonitor.waInstances[instanceName].updateProfileName(data.name);
  }

  public async updateProfileStatus(
    { instanceName }: InstanceDto,
    data: ProfileStatusDto,
  ) {
    return await this.waMonitor.waInstances[instanceName].updateProfileStatus(
      data.status,
    );
  }

  public async updateProfilePicture(
    { instanceName }: InstanceDto,
    data: ProfilePictureDto,
  ) {
    return await this.waMonitor.waInstances[instanceName].updateProfilePicture(
      data.picture,
    );
  }

  public async removeProfilePicture(
    { instanceName }: InstanceDto,
    data: ProfilePictureDto,
  ) {
    return await this.waMonitor.waInstances[instanceName].removeProfilePicture();
  }
}
