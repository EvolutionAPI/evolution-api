import { InstanceDto } from '@api/dto/instance.dto';
import {
  OfferCallDto,
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
} from '@api/dto/sendMessage.dto';
import { WAMonitoringService } from '@api/services/monitor.service';
import { BadRequestException } from '@exceptions';
import { isBase64, isURL } from 'class-validator';

export class SendMessageController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async sendTemplate({ instanceName }: InstanceDto, data: SendTemplateDto) {
    return await this.waMonitor.waInstances[instanceName].templateMessage(data);
  }

  public async sendText({ instanceName }: InstanceDto, data: SendTextDto) {
    return await this.waMonitor.waInstances[instanceName].textMessage(data);
  }

  public async sendMedia({ instanceName }: InstanceDto, data: SendMediaDto, file?: any) {
    if (isBase64(data?.media) && !data?.fileName && data?.mediatype === 'document') {
      throw new BadRequestException('For base64 the file name must be informed.');
    }

    if (file || isURL(data?.media) || isBase64(data?.media)) {
      return await this.waMonitor.waInstances[instanceName].mediaMessage(data, file);
    }
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendSticker({ instanceName }: InstanceDto, data: SendStickerDto, file?: any) {
    if (file || isURL(data.sticker) || isBase64(data.sticker)) {
      return await this.waMonitor.waInstances[instanceName].mediaSticker(data, file);
    }
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendWhatsAppAudio({ instanceName }: InstanceDto, data: SendAudioDto, file?: any) {
    if (file?.buffer || isURL(data.audio) || isBase64(data.audio)) {
        // Si file existe y tiene buffer, o si es una URL o Base64, continúa
        return await this.waMonitor.waInstances[instanceName].audioWhatsapp(data, file);
    } else {
        console.error('El archivo no tiene buffer o el audio no es una URL o Base64 válida');
        throw new BadRequestException('Owned media must be a url, base64, or valid file with buffer');
    }
}

  public async sendButtons({ instanceName }: InstanceDto, data: SendButtonDto) {
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
    if (!data.reaction.match(/[^()\w\sà-ú"-+]+/)) {
      throw new BadRequestException('"reaction" must be an emoji');
    }
    return await this.waMonitor.waInstances[instanceName].reactionMessage(data);
  }

  public async sendPoll({ instanceName }: InstanceDto, data: SendPollDto) {
    return await this.waMonitor.waInstances[instanceName].pollMessage(data);
  }

  public async sendStatus({ instanceName }: InstanceDto, data: SendStatusDto, file?: any) {
    return await this.waMonitor.waInstances[instanceName].statusMessage(data, file);
  }

  public async offerCall({ instanceName }: InstanceDto, data: OfferCallDto) {
    return await this.waMonitor.waInstances[instanceName].offerCall(data);
  }
}
