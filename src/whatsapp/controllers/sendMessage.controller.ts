import { isBase64, isURL } from 'class-validator';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
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
  SendTextDto,
} from '../dto/sendMessage.dto';
import { WAMonitoringService } from '../services/monitor.service';

export class SendMessageController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async sendText({ instanceName }: InstanceDto, data: SendTextDto) {
    return await this.waMonitor.waInstances[instanceName].textMessage(data);
  }

  public async sendMedia({ instanceName }: InstanceDto, data: SendMediaDto) {
    if (isBase64(data?.mediaMessage?.media) && !data?.mediaMessage?.fileName) {
      throw new BadRequestException('For bse64 the file name must be informed.');
    }
    if (isURL(data?.mediaMessage?.media) || isBase64(data?.mediaMessage?.media)) {
      return await this.waMonitor.waInstances[instanceName].mediaMessage(data);
    }
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendWhatsAppAudio({ instanceName }: InstanceDto, data: SendAudioDto) {
    if (isURL(data.audioMessage.audio) || isBase64(data.audioMessage.audio)) {
      return await this.waMonitor.waInstances[instanceName].audioWhatsapp(data);
    }
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendButtons({ instanceName }: InstanceDto, data: SendButtonDto) {
    if (
      isBase64(data.buttonMessage.mediaMessage?.media) &&
      !data.buttonMessage.mediaMessage?.fileName
    ) {
      throw new BadRequestException('For bse64 the file name must be informed.');
    }
    return await this.waMonitor.waInstances[instanceName].buttonMessage(data);
  }

  public async sendLocation({ instanceName }: InstanceDto, data: SendLocationDto) {
    return await this.waMonitor.waInstances[instanceName].locationMessage(data);
  }

  public async sendList({ instanceName }: InstanceDto, data: SendListDto) {
    return await this.waMonitor.waInstances[instanceName].listMessage(data);
  }

  public async sendContact({ instanceName }: InstanceDto, data: SendContactDto) {
    return await this.waMonitor.waInstances[instanceName].contactMessage(data);
  }

  public async sendReaction({ instanceName }: InstanceDto, data: SendReactionDto) {
    if (!data.reactionMessage.reaction.match(/[^\(\)\w\sà-ú"-\+]+/)) {
      throw new BadRequestException('"reaction" must be an emoji');
    }
    return await this.waMonitor.waInstances[instanceName].reactionMessage(data);
  }

  public async sendPoll({ instanceName }: InstanceDto, data: SendPollDto) {
    return await this.waMonitor.waInstances[instanceName].pollMessage(data);
  }

  public async sendLinkPreview({ instanceName }: InstanceDto, data: SendLinkPreviewDto) {
    return await this.waMonitor.waInstances[instanceName].linkPreview(data);
  }
}
