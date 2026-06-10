import { BusinessStartupService } from '@api/integrations/channel/meta/whatsapp.business.service';
import { ProviderFiles } from '@api/provider/sessions';
import { PrismaRepository } from '@api/repository/repository.service';
import { CacheService } from '@api/services/cache.service';
import { ConfigService, EvolutionHub } from '@config/env.config';
import { InternalServerErrorException } from '@exceptions';
import axios from 'axios';
import { isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import FormData from 'form-data';

/**
 * EvoHub channel — espelho do canal Meta (WhatsApp Cloud), roteado pelo proxy
 * transparente do EvoHub. Estende BusinessStartupService e sobrescreve SOMENTE o
 * transporte (URL base + bearer): a URL passa a ser `${HUB}/meta/...` SEM segmento
 * de versão (o hub injeta a versão), mantendo `Authorization: Bearer ${this.token}`
 * onde `this.token` é o channel_token do hub. Toda a lógica de construção de mensagem,
 * eventHandler, persistência, Chatwoot e S3 é herdada intacta do serviço Meta.
 */
export class EvoHubStartupService extends BusinessStartupService {
  constructor(
    public readonly configService: ConfigService,
    public readonly eventEmitter: EventEmitter2,
    public readonly prismaRepository: PrismaRepository,
    public readonly cache: CacheService,
    public readonly chatwootCache: CacheService,
    public readonly baileysCache: CacheService,
    public readonly hubProviderFiles: ProviderFiles,
  ) {
    super(configService, eventEmitter, prismaRepository, cache, chatwootCache, baileysCache, hubProviderFiles);
  }

  // ---- Transporte: igual ao Meta, mas via {HUB}/meta SEM segmento de versão ----

  protected async post(message: any, params: string) {
    try {
      const urlServer = this.configService.get<EvolutionHub>('EVOLUTION_HUB').URL;
      const url = `${urlServer}/meta/${this.number}/${params}`;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
      const result = await axios.post(url, message, { headers });
      return result.data;
    } catch (e) {
      return e.response?.data?.error;
    }
  }

  protected async downloadMediaMessage(message: any) {
    try {
      const id = message[message.type].id;
      const urlServer = this.configService.get<EvolutionHub>('EVOLUTION_HUB').URL;
      const url = `${urlServer}/meta/${id}`;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };

      // Primeiro, obtenha a URL do arquivo (o hub devolve a URL de download)
      let result = await axios.get(url, { headers });

      // Depois, baixe o arquivo usando a URL retornada
      result = await axios.get(result.data.url, {
        headers: { Authorization: `Bearer ${this.token}` },
        responseType: 'arraybuffer',
      });

      return result.data;
    } catch (e) {
      this.logger.error(`Error downloading media (EvoHub): ${e}`);
      throw e;
    }
  }

  // Cobre o bloco inline de messageHandle (storage S3): mesmo formato de retorno,
  // mas via {HUB}/meta/${id} SEM segmento de versão.
  protected async fetchMediaFromGraph(id: string): Promise<{ result: any; buffer: any }> {
    const urlServer = this.configService.get<EvolutionHub>('EVOLUTION_HUB').URL;
    const url = `${urlServer}/meta/${id}`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };

    const result = await axios.get(url, { headers });
    const buffer = await axios.get(result.data.url, {
      headers: { Authorization: `Bearer ${this.token}` },
      responseType: 'arraybuffer',
    });

    return { result, buffer };
  }

  protected async getIdMedia(mediaMessage: any, isFile = false) {
    try {
      const formData = new FormData();

      if (isFile === false) {
        if (isURL(mediaMessage.media)) {
          const response = await axios.get(mediaMessage.media, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data, 'base64');
          formData.append('file', buffer, {
            filename: mediaMessage.fileName || 'media',
            contentType: mediaMessage.mimetype,
          });
        } else {
          const buffer = Buffer.from(mediaMessage.media, 'base64');
          formData.append('file', buffer, {
            filename: mediaMessage.fileName || 'media',
            contentType: mediaMessage.mimetype,
          });
        }
      } else {
        formData.append('file', mediaMessage.media.buffer, {
          filename: mediaMessage.media.originalname,
          contentType: mediaMessage.media.mimetype,
        });
      }

      const mimetype = mediaMessage.mimetype || mediaMessage.media.mimetype;
      formData.append('typeFile', mimetype);
      formData.append('messaging_product', 'whatsapp');

      const headers = { Authorization: `Bearer ${this.token}` };
      const urlServer = this.configService.get<EvolutionHub>('EVOLUTION_HUB').URL;
      const url = `${urlServer}/meta/${this.number}/media`;

      const res = await axios.post(url, formData, { headers });
      return res.data.id;
    } catch (error) {
      this.logger.error(error.response?.data);
      throw new InternalServerErrorException(error?.toString() || error);
    }
  }
}
