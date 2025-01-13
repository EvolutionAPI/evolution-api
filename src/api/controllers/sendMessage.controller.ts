import { InstanceDto } from '@api/dto/instance.dto';
import {
  SendAudioDto,
  SendButtonsDto,
  SendContactDto,
  SendListDto,
  SendLocationDto,
  SendMediaDto,
  SendPollDto,
  SendPtvDto,
  SendReactionDto,
  SendStatusDto,
  SendStickerDto,
  SendTemplateDto,
  SendTextDto,
} from '@api/dto/sendMessage.dto';
import { WAMonitoringService } from '@api/services/monitor.service';
import { BadRequestException } from '@exceptions';
import { isBase64, isURL } from 'class-validator';
import { Logger } from '@config/logger.config';

export class SendMessageController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger('SendMessageController');

  public async sendTemplate({ instanceName }: InstanceDto, data: SendTemplateDto) {
    this.logger.log(`[sendTemplate] [${instanceName}] - Iniciando envio de template...`);
    this.logger.debug(`[sendTemplate] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].templateMessage(data);

    this.logger.log(`[sendTemplate] [${instanceName}] - Envio concluído com sucesso.`);
    this.logger.debug(`[sendTemplate] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendText({ instanceName }: InstanceDto, data: SendTextDto) {
    this.logger.log(`[sendText] [${instanceName}] - Iniciando envio de texto...`);
    this.logger.debug(`[sendText] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].textMessage(data);

    this.logger.log(`[sendText] [${instanceName}] - Envio concluído com sucesso.`);
    this.logger.debug(`[sendText] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendMedia({ instanceName }: InstanceDto, data: SendMediaDto, file?: any) {
    this.logger.log(`[sendMedia] [${instanceName}] - Iniciando envio de mídia...`);
    this.logger.debug(`[sendMedia] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    if (isBase64(data?.media) && !data?.fileName && data?.mediatype === 'document') {
      this.logger.error(
        `[sendMedia] [${instanceName}] - Falha: Para base64, é necessário informar o nome do arquivo.`
      );
      throw new BadRequestException('For base64 the file name must be informed.');
    }

    if (file || isURL(data?.media) || isBase64(data?.media)) {
      const result = await this.waMonitor.waInstances[instanceName].mediaMessage(data, file);
      this.logger.log(`[sendMedia] [${instanceName}] - Envio de mídia concluído com sucesso.`);
      this.logger.debug(`[sendMedia] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);
      return result;
    }

    this.logger.error(
      `[sendMedia] [${instanceName}] - Falha: Mídia deve ser uma URL ou base64.`
    );
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendPtv({ instanceName }: InstanceDto, data: SendPtvDto, file?: any) {
    this.logger.log(`[sendPtv] [${instanceName}] - Iniciando envio de vídeo (PTV)...`);
    this.logger.debug(`[sendPtv] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    if (file || isURL(data?.video) || isBase64(data?.video)) {
      const result = await this.waMonitor.waInstances[instanceName].ptvMessage(data, file);
      this.logger.log(`[sendPtv] [${instanceName}] - Envio de vídeo (PTV) concluído com sucesso.`);
      this.logger.debug(`[sendPtv] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);
      return result;
    }

    this.logger.error(
      `[sendPtv] [${instanceName}] - Falha: Vídeo deve ser uma URL ou base64.`
    );
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendSticker({ instanceName }: InstanceDto, data: SendStickerDto, file?: any) {
    this.logger.log(`[sendSticker] [${instanceName}] - Iniciando envio de sticker...`);
    this.logger.debug(`[sendSticker] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    if (file || isURL(data.sticker) || isBase64(data.sticker)) {
      const result = await this.waMonitor.waInstances[instanceName].mediaSticker(data, file);
      this.logger.log(`[sendSticker] [${instanceName}] - Envio de sticker concluído com sucesso.`);
      this.logger.debug(`[sendSticker] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);
      return result;
    }

    this.logger.error(
      `[sendSticker] [${instanceName}] - Falha: Sticker deve ser uma URL ou base64.`
    );
    throw new BadRequestException('Owned media must be a url or base64');
  }

  public async sendWhatsAppAudio({ instanceName }: InstanceDto, data: SendAudioDto, file?: any) {
    this.logger.log(`[sendWhatsAppAudio] [${instanceName}] - Iniciando envio de áudio...`);
    this.logger.debug(`[sendWhatsAppAudio] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    if (file?.buffer || isURL(data.audio) || isBase64(data.audio)) {
      const result = await this.waMonitor.waInstances[instanceName].audioWhatsapp(data, file);
      this.logger.log(`[sendWhatsAppAudio] [${instanceName}] - Envio de áudio concluído com sucesso.`);
      this.logger.debug(`[sendWhatsAppAudio] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);
      return result;
    } else {
      this.logger.error(
        `[sendWhatsAppAudio] [${instanceName}] - Falha: O arquivo não possui buffer, ou o áudio não é uma URL/base64 válida.`
      );
      throw new BadRequestException(
        'Owned media must be a url, base64, or valid file with buffer'
      );
    }
  }

  public async sendButtons({ instanceName }: InstanceDto, data: SendButtonsDto) {
    this.logger.log(`[sendButtons] [${instanceName}] - Iniciando envio de botões...`);
    this.logger.debug(`[sendButtons] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].buttonMessage(data);

    this.logger.log(`[sendButtons] [${instanceName}] - Envio de botões concluído com sucesso.`);
    this.logger.debug(`[sendButtons] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendLocation({ instanceName }: InstanceDto, data: SendLocationDto) {
    this.logger.log(`[sendLocation] [${instanceName}] - Iniciando envio de localização...`);
    this.logger.debug(`[sendLocation] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].locationMessage(data);

    this.logger.log(`[sendLocation] [${instanceName}] - Envio de localização concluído com sucesso.`);
    this.logger.debug(`[sendLocation] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendList({ instanceName }: InstanceDto, data: SendListDto) {
    this.logger.log(`[sendList] [${instanceName}] - Iniciando envio de lista...`);
    this.logger.debug(`[sendList] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].listMessage(data);

    this.logger.log(`[sendList] [${instanceName}] - Envio de lista concluído com sucesso.`);
    this.logger.debug(`[sendList] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendContact({ instanceName }: InstanceDto, data: SendContactDto) {
    this.logger.log(`[sendContact] [${instanceName}] - Iniciando envio de contato...`);
    this.logger.debug(`[sendContact] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].contactMessage(data);

    this.logger.log(`[sendContact] [${instanceName}] - Envio de contato concluído com sucesso.`);
    this.logger.debug(`[sendContact] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendReaction({ instanceName }: InstanceDto, data: SendReactionDto) {
    this.logger.log(`[sendReaction] [${instanceName}] - Iniciando envio de reação...`);
    this.logger.debug(`[sendReaction] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    if (!data.reaction.match(/[^()\w\sà-ú"-+]+/)) {
      this.logger.error(`[sendReaction] [${instanceName}] - Falha: "reaction" deve ser um emoji.`);
      throw new BadRequestException('"reaction" must be an emoji');
    }

    const result = await this.waMonitor.waInstances[instanceName].reactionMessage(data);

    this.logger.log(`[sendReaction] [${instanceName}] - Envio de reação concluído com sucesso.`);
    this.logger.debug(`[sendReaction] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendPoll({ instanceName }: InstanceDto, data: SendPollDto) {
    this.logger.log(`[sendPoll] [${instanceName}] - Iniciando envio de enquete (poll)...`);
    this.logger.debug(`[sendPoll] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].pollMessage(data);

    this.logger.log(`[sendPoll] [${instanceName}] - Envio de enquete concluído com sucesso.`);
    this.logger.debug(`[sendPoll] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }

  public async sendStatus({ instanceName }: InstanceDto, data: SendStatusDto, file?: any) {
    this.logger.log(`[sendStatus] [${instanceName}] - Iniciando envio de Status...`);
    this.logger.debug(`[sendStatus] [${instanceName}] - Dados de envio: ${JSON.stringify(data)}`);

    const result = await this.waMonitor.waInstances[instanceName].statusMessage(data, file);

    this.logger.log(`[sendStatus] [${instanceName}] - Envio de Status concluído com sucesso.`);
    this.logger.debug(`[sendStatus] [${instanceName}] - Resultado: ${JSON.stringify(result)}`);

    return result;
  }
}
