import { isBase64, isURL } from 'class-validator';

import { Logger } from '../../config/logger.config';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import {
  SendAudioDto,
  SendButtonDto,
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
import { WAMonitoringService } from '../services/monitor.service';

const logger = new Logger('MessageRouter');

export class SendMessageController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async sendText({ instanceName }: InstanceDto, data: SendTextDto) {
    logger.verbose('requested sendText from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].textMessage(data);
  }

  public async sendTemplate({ instanceName }: InstanceDto, data: SendTemplateDto) {
    logger.verbose('requested sendList from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].templateMessage(data);
  }

  public async sendMedia({ instanceName }: InstanceDto, data: SendMediaDto) {
    logger.verbose('requested sendMedia from ' + instanceName + ' instance');

    if (
      isBase64(data?.mediaMessage?.media) &&
      !data?.mediaMessage?.fileName &&
      data?.mediaMessage?.mediatype === 'document'
    ) {
      throw new BadRequestException('For base64 the file name must be informed.');
    }

    logger.verbose('isURL: ' + isURL(data?.mediaMessage?.media) + ', isBase64: ' + isBase64(data?.mediaMessage?.media));
    if (isURL(data?.mediaMessage?.media) || isBase64(data?.mediaMessage?.media)) {
      return await this.waMonitor.waInstances[instanceName].mediaMessage(data);
    }
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendSticker({ instanceName }: InstanceDto, data: SendStickerDto) {
    logger.verbose('requested sendSticker from ' + instanceName + ' instance');

    logger.verbose(
      'isURL: ' + isURL(data?.stickerMessage?.image) + ', isBase64: ' + isBase64(data?.stickerMessage?.image),
    );
    if (isURL(data.stickerMessage.image) || isBase64(data.stickerMessage.image)) {
      return await this.waMonitor.waInstances[instanceName].mediaSticker(data);
    }
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendWhatsAppAudio({ instanceName }: InstanceDto, data: SendAudioDto) {
    logger.verbose('requested sendWhatsAppAudio from ' + instanceName + ' instance');

    logger.verbose('isURL: ' + isURL(data?.audioMessage?.audio) + ', isBase64: ' + isBase64(data?.audioMessage?.audio));
    if (isURL(data.audioMessage.audio) || isBase64(data.audioMessage.audio)) {
      return await this.waMonitor.waInstances[instanceName].audioWhatsapp(data);
    }
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendButtons({ instanceName }: InstanceDto, data: SendButtonDto) {
    logger.verbose('requested sendButtons from ' + instanceName + ' instance');
    if (isBase64(data.buttonMessage.mediaMessage?.media) && !data.buttonMessage.mediaMessage?.fileName) {
      throw new BadRequestException('For bse64 the file name must be informed.');
    }
    return await this.waMonitor.waInstances[instanceName].buttonMessage(data);
  }

  public async sendLocation({ instanceName }: InstanceDto, data: SendLocationDto) {
    logger.verbose('requested sendLocation from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].locationMessage(data);
  }

  public async sendList({ instanceName }: InstanceDto, data: SendListDto) {
    logger.verbose('requested sendList from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].listMessage(data);
  }

  public async sendContact({ instanceName }: InstanceDto, data: SendContactDto) {
    logger.verbose('requested sendContact from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].contactMessage(data);
  }

  public async sendReaction({ instanceName }: InstanceDto, data: SendReactionDto) {
    logger.verbose('requested sendReaction from ' + instanceName + ' instance');
    if (!data.reactionMessage.reaction.match(/[^()\w\sà-ú"-+]+/)) {
      throw new BadRequestException('"reaction" must be an emoji');
    }
    return await this.waMonitor.waInstances[instanceName].reactionMessage(data);
  }

  public async sendPoll({ instanceName }: InstanceDto, data: SendPollDto) {
    logger.verbose('requested sendPoll from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].pollMessage(data);
  }

  public async sendStatus({ instanceName }: InstanceDto, data: SendStatusDto) {
    logger.verbose('requested sendStatus from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].statusMessage(data);
  }
}
