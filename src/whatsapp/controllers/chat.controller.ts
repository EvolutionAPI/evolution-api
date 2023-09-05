import { Logger } from '../../config/logger.config';
import {
  ArchiveChatDto,
  DeleteMessage,
  getBase64FromMediaMessageDto,
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

const logger = new Logger('ChatController');

export class ChatController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async whatsappNumber({ instanceName }: InstanceDto, data: WhatsAppNumberDto) {
    logger.verbose('requested whatsappNumber from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].whatsappNumber(data);
  }

  public async readMessage({ instanceName }: InstanceDto, data: ReadMessageDto) {
    logger.verbose('requested readMessage from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].markMessageAsRead(data);
  }

  public async archiveChat({ instanceName }: InstanceDto, data: ArchiveChatDto) {
    logger.verbose('requested archiveChat from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].archiveChat(data);
  }

  public async deleteMessage({ instanceName }: InstanceDto, data: DeleteMessage) {
    logger.verbose('requested deleteMessage from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].deleteMessage(data);
  }

  public async fetchProfilePicture({ instanceName }: InstanceDto, data: NumberDto) {
    logger.verbose('requested fetchProfilePicture from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].profilePicture(data.number);
  }

  public async fetchProfile({ instanceName }: InstanceDto, data: NumberDto) {
    logger.verbose('requested fetchProfile from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchProfile(instanceName, data.number);
  }

  public async fetchContacts({ instanceName }: InstanceDto, query: ContactQuery) {
    logger.verbose('requested fetchContacts from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchContacts(query);
  }

  public async getBase64FromMediaMessage({ instanceName }: InstanceDto, data: getBase64FromMediaMessageDto) {
    logger.verbose('requested getBase64FromMediaMessage from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].getBase64FromMediaMessage(data);
  }

  public async fetchMessages({ instanceName }: InstanceDto, query: MessageQuery) {
    logger.verbose('requested fetchMessages from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchMessages(query);
  }

  public async fetchStatusMessage({ instanceName }: InstanceDto, query: MessageUpQuery) {
    logger.verbose('requested fetchStatusMessage from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchStatusMessage(query);
  }

  public async fetchChats({ instanceName }: InstanceDto) {
    logger.verbose('requested fetchChats from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchChats();
  }

  public async fetchPrivacySettings({ instanceName }: InstanceDto) {
    logger.verbose('requested fetchPrivacySettings from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchPrivacySettings();
  }

  public async updatePrivacySettings({ instanceName }: InstanceDto, data: PrivacySettingDto) {
    logger.verbose('requested updatePrivacySettings from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].updatePrivacySettings(data);
  }

  public async fetchBusinessProfile({ instanceName }: InstanceDto, data: ProfilePictureDto) {
    logger.verbose('requested fetchBusinessProfile from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchBusinessProfile(data.number);
  }

  public async updateProfileName({ instanceName }: InstanceDto, data: ProfileNameDto) {
    logger.verbose('requested updateProfileName from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].updateProfileName(data.name);
  }

  public async updateProfileStatus({ instanceName }: InstanceDto, data: ProfileStatusDto) {
    logger.verbose('requested updateProfileStatus from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].updateProfileStatus(data.status);
  }

  public async updateProfilePicture({ instanceName }: InstanceDto, data: ProfilePictureDto) {
    logger.verbose('requested updateProfilePicture from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].updateProfilePicture(data.picture);
  }

  public async removeProfilePicture({ instanceName }: InstanceDto) {
    logger.verbose('requested removeProfilePicture from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].removeProfilePicture();
  }
}
