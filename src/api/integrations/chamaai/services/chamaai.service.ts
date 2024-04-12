import axios from 'axios';
import { writeFileSync } from 'fs';
import path from 'path';

import { ConfigService, HttpServer } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { ChamaaiRaw } from '../../../models';
import { WAMonitoringService } from '../../../services/monitor.service';
import { Events } from '../../../types/wa.types';
import { ChamaaiDto } from '../dto/chamaai.dto';

export class ChamaaiService {
  constructor(private readonly waMonitor: WAMonitoringService, private readonly configService: ConfigService) {}

  private readonly logger = new Logger(ChamaaiService.name);

  public create(instance: InstanceDto, data: ChamaaiDto) {
    this.logger.verbose('create chamaai: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setChamaai(data);

    return { chamaai: { ...instance, chamaai: data } };
  }

  public async find(instance: InstanceDto): Promise<ChamaaiRaw> {
    try {
      this.logger.verbose('find chamaai: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findChamaai();

      if (Object.keys(result).length === 0) {
        throw new Error('Chamaai not found');
      }

      return result;
    } catch (error) {
      return { enabled: false, url: '', token: '', waNumber: '', answerByAudio: false };
    }
  }

  private getTypeMessage(msg: any) {
    this.logger.verbose('get type message');

    const types = {
      conversation: msg.conversation,
      extendedTextMessage: msg.extendedTextMessage?.text,
    };

    this.logger.verbose('type message: ' + types);

    return types;
  }

  private getMessageContent(types: any) {
    this.logger.verbose('get message content');
    const typeKey = Object.keys(types).find((key) => types[key] !== undefined);

    const result = typeKey ? types[typeKey] : undefined;

    this.logger.verbose('message content: ' + result);

    return result;
  }

  private getConversationMessage(msg: any) {
    this.logger.verbose('get conversation message');

    const types = this.getTypeMessage(msg);

    const messageContent = this.getMessageContent(types);

    this.logger.verbose('conversation message: ' + messageContent);

    return messageContent;
  }

  private calculateTypingTime(text: string) {
    const wordsPerMinute = 100;

    const wordCount = text.split(' ').length;
    const typingTimeInMinutes = wordCount / wordsPerMinute;
    const typingTimeInMilliseconds = typingTimeInMinutes * 60;
    return typingTimeInMilliseconds;
  }

  private convertToMilliseconds(count: number) {
    const averageCharactersPerSecond = 15;
    const characterCount = count;
    const speakingTimeInSeconds = characterCount / averageCharactersPerSecond;
    return speakingTimeInSeconds;
  }

  private getRegexPatterns() {
    const patternsToCheck = [
      '.*atend.*humano.*',
      '.*falar.*com.*um.*humano.*',
      '.*fala.*humano.*',
      '.*atend.*humano.*',
      '.*fala.*atend.*',
      '.*preciso.*ajuda.*',
      '.*quero.*suporte.*',
      '.*preciso.*assiste.*',
      '.*ajuda.*atend.*',
      '.*chama.*atendente.*',
      '.*suporte.*urgente.*',
      '.*atend.*por.*favor.*',
      '.*quero.*falar.*com.*alguém.*',
      '.*falar.*com.*um.*humano.*',
      '.*transfer.*humano.*',
      '.*transfer.*atend.*',
      '.*equipe.*humano.*',
      '.*suporte.*humano.*',
    ];

    const regexPatterns = patternsToCheck.map((pattern) => new RegExp(pattern, 'iu'));
    return regexPatterns;
  }

  public async sendChamaai(instance: InstanceDto, remoteJid: string, msg: any) {
    const content = this.getConversationMessage(msg.message);
    const msgType = msg.messageType;
    const find = await this.find(instance);
    const url = find.url;
    const token = find.token;
    const waNumber = find.waNumber;
    const answerByAudio = find.answerByAudio;

    if (!content && msgType !== 'audioMessage') {
      return;
    }

    let data;
    let endpoint;

    if (msgType === 'audioMessage') {
      const downloadBase64 = await this.waMonitor.waInstances[instance.instanceName].getBase64FromMediaMessage({
        message: {
          ...msg,
        },
      });

      const random = Math.random().toString(36).substring(7);
      const nameFile = `${random}.ogg`;

      const fileData = Buffer.from(downloadBase64.base64, 'base64');

      const fileName = `${path.join(
        this.waMonitor.waInstances[instance.instanceName].storePath,
        'temp',
        `${nameFile}`,
      )}`;

      writeFileSync(fileName, fileData, 'utf8');

      const urlServer = this.configService.get<HttpServer>('SERVER').URL;

      const url = `${urlServer}/store/temp/${nameFile}`;

      data = {
        waNumber: waNumber,
        audioUrl: url,
        queryNumber: remoteJid.split('@')[0],
        answerByAudio: answerByAudio,
      };
      endpoint = 'processMessageAudio';
    } else {
      data = {
        waNumber: waNumber,
        question: content,
        queryNumber: remoteJid.split('@')[0],
        answerByAudio: answerByAudio,
      };
      endpoint = 'processMessageText';
    }

    const request = await axios.post(`${url}/${endpoint}`, data, {
      headers: {
        Authorization: `${token}`,
      },
    });

    const answer = request.data?.answer;

    const type = request.data?.type;

    const characterCount = request.data?.characterCount;

    if (answer) {
      if (type === 'text') {
        this.waMonitor.waInstances[instance.instanceName].textMessage({
          number: remoteJid.split('@')[0],
          options: {
            delay: this.calculateTypingTime(answer) * 1000 || 1000,
            presence: 'composing',
            linkPreview: false,
            quoted: {
              key: msg.key,
              message: msg.message,
            },
          },
          textMessage: {
            text: answer,
          },
        });
      }

      if (type === 'audio') {
        this.waMonitor.waInstances[instance.instanceName].audioWhatsapp({
          number: remoteJid.split('@')[0],
          options: {
            delay: characterCount ? this.convertToMilliseconds(characterCount) * 1000 || 1000 : 1000,
            presence: 'recording',
            encoding: true,
          },
          audioMessage: {
            audio: answer,
          },
        });
      }

      if (this.getRegexPatterns().some((pattern) => pattern.test(answer))) {
        this.waMonitor.waInstances[instance.instanceName].sendDataWebhook(Events.CHAMA_AI_ACTION, {
          remoteJid: remoteJid,
          message: msg,
          answer: answer,
          action: 'transfer',
        });
      }
    }
  }
}
