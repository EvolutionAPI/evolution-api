import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Auth, ConfigService, HttpServer } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { Dify, DifySetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';
import { Readable } from 'stream';

export class DifyService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private readonly logger = new Logger('DifyService');

  public async createNewSession(instance: InstanceDto, data: any) {
    try {
      const session = await this.prismaRepository.integrationSession.create({
        data: {
          remoteJid: data.remoteJid,
          sessionId: data.remoteJid,
          status: 'opened',
          awaitUser: false,
          botId: data.difyId,
          instanceId: instance.instanceId,
        },
      });

      return { session };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private isImageMessage(content: string) {
    return content.includes('imageMessage');
  }

  private async initNewSession(
    instance: any,
    remoteJid: string,
    dify: Dify,
    settings: DifySetting,
    session: IntegrationSession,
    content: string,
    pushName?: string,
  ) {
    const data = await this.createNewSession(instance, {
      remoteJid,
      difyId: dify.id,
    });

    if (data.session) {
      session = data.session;
    }

    let endpoint: string = dify.apiUrl;

    if (dify.botType === 'chatBot') {
      endpoint += '/chat-messages';
      const payload: any = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      const regex = /!?\[(.*?)\]\((.*?)\)/g;

      const result = [];
      let lastIndex = 0;

      let match;
      while ((match = regex.exec(message)) !== null) {
        if (match.index > lastIndex) {
          result.push({ text: message.slice(lastIndex, match.index).trim() });
        }

        result.push({ caption: match[1], url: match[2] });

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < message.length) {
        result.push({ text: message.slice(lastIndex).trim() });
      }

      for (const item of result) {
        if (item.text) {
          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: item.text,
            },
            false,
          );
        }

        if (item.url) {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'image',
              media: item.url,
              caption: item.caption,
            },
            false,
          );
        }
      }

      await this.prismaRepository.integrationSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'textGenerator') {
      endpoint += '/completion-messages';
      const payload: any = {
        inputs: {
          query: content,
          pushName: pushName,
          remoteJid: remoteJid,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.inputs.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      const regex = /!?\[(.*?)\]\((.*?)\)/g;

      const result = [];
      let lastIndex = 0;

      let match;
      while ((match = regex.exec(message)) !== null) {
        if (match.index > lastIndex) {
          result.push({ text: message.slice(lastIndex, match.index).trim() });
        }

        result.push({ caption: match[1], url: match[2] });

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < message.length) {
        result.push({ text: message.slice(lastIndex).trim() });
      }

      for (const item of result) {
        if (item.text) {
          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: item.text,
            },
            false,
          );
        }

        if (item.url) {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'image',
              media: item.url,
              caption: item.caption,
            },
            false,
          );
        }
      }

      await this.prismaRepository.integrationSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'agent') {
      endpoint += '/chat-messages';
      const payload: any = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'streaming',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
        responseType: 'stream',
      });

      let conversationId;

      const stream = response.data;
      const reader = new Readable().wrap(stream);

      reader.on('data', (chunk) => {
        const data = chunk.toString();

        try {
          const event = JSON.parse(data);
          if (event.event === 'agent_message') {
            conversationId = conversationId ?? event?.conversation_id;
          }
        } catch (error) {
          console.error('Error parsing stream data:', error);
        }
      });

      reader.on('end', async () => {
        await instance.client.sendPresenceUpdate('paused', remoteJid);

        const message = response?.data?.answer;

        const regex = /!?\[(.*?)\]\((.*?)\)/g;

        const result = [];
        let lastIndex = 0;

        let match;
        while ((match = regex.exec(message)) !== null) {
          if (match.index > lastIndex) {
            result.push({ text: message.slice(lastIndex, match.index).trim() });
          }

          result.push({ caption: match[1], url: match[2] });

          lastIndex = regex.lastIndex;
        }

        if (lastIndex < message.length) {
          result.push({ text: message.slice(lastIndex).trim() });
        }

        for (const item of result) {
          if (item.text) {
            await instance.textMessage(
              {
                number: remoteJid.split('@')[0],
                delay: settings?.delayMessage || 1000,
                text: item.text,
              },
              false,
            );
          }

          if (item.url) {
            await instance.mediaMessage(
              {
                number: remoteJid.split('@')[0],
                delay: settings?.delayMessage || 1000,
                mediatype: 'image',
                media: item.url,
                caption: item.caption,
              },
              false,
            );
          }
        }

        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
            sessionId: conversationId,
          },
        });

        sendTelemetry('/message/sendText');
      });

      reader.on('error', (error) => {
        console.error('Error reading stream:', error);
      });

      return;
    }

    if (dify.botType === 'workflow') {
      endpoint += '/workflows/run';
      const payload: any = {
        inputs: {
          query: content,
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.inputs.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.data.outputs.text;

      const regex = /!?\[(.*?)\]\((.*?)\)/g;

      const result = [];
      let lastIndex = 0;

      let match;
      while ((match = regex.exec(message)) !== null) {
        if (match.index > lastIndex) {
          result.push({ text: message.slice(lastIndex, match.index).trim() });
        }

        result.push({ caption: match[1], url: match[2] });

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < message.length) {
        result.push({ text: message.slice(lastIndex).trim() });
      }

      for (const item of result) {
        if (item.text) {
          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: item.text,
            },
            false,
          );
        }

        if (item.url) {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'image',
              media: item.url,
              caption: item.caption,
            },
            false,
          );
        }
      }

      if (settings.keepOpen) {
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.integrationSession.delete({
          where: {
            id: session.id,
          },
        });
      }

      sendTelemetry('/message/sendText');

      return;
    }

    return;
  }

  public async processDify(
    instance: any,
    remoteJid: string,
    dify: Dify,
    session: IntegrationSession,
    settings: DifySetting,
    content: string,
    pushName?: string,
  ) {
    if (session && session.status !== 'opened') {
      return;
    }

    if (session && settings.expire && settings.expire > 0) {
      const now = Date.now();

      const sessionUpdatedAt = new Date(session.updatedAt).getTime();

      const diff = now - sessionUpdatedAt;

      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > settings.expire) {
        if (settings.keepOpen) {
          await this.prismaRepository.integrationSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.integrationSession.deleteMany({
            where: {
              botId: dify.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initNewSession(instance, remoteJid, dify, settings, session, content, pushName);
        return;
      }
    }

    if (!session) {
      await this.initNewSession(instance, remoteJid, dify, settings, session, content, pushName);
      return;
    }

    await this.prismaRepository.integrationSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: false,
      },
    });

    if (!content) {
      if (settings.unknownMessage) {
        this.waMonitor.waInstances[instance.instanceName].textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings.delayMessage || 1000,
            text: settings.unknownMessage,
          },
          false,
        );

        sendTelemetry('/message/sendText');
      }
      return;
    }

    if (settings.keywordFinish && content.toLowerCase() === settings.keywordFinish.toLowerCase()) {
      if (settings.keepOpen) {
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.integrationSession.deleteMany({
          where: {
            botId: dify.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    let endpoint: string = dify.apiUrl;

    if (dify.botType === 'chatBot') {
      endpoint += '/chat-messages';
      const payload: any = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      const regex = /!?\[(.*?)\]\((.*?)\)/g;

      const result = [];
      let lastIndex = 0;

      let match;
      while ((match = regex.exec(message)) !== null) {
        if (match.index > lastIndex) {
          result.push({ text: message.slice(lastIndex, match.index).trim() });
        }

        result.push({ caption: match[1], url: match[2] });

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < message.length) {
        result.push({ text: message.slice(lastIndex).trim() });
      }

      for (const item of result) {
        if (item.text) {
          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: item.text,
            },
            false,
          );
        }

        if (item.url) {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'image',
              media: item.url,
              caption: item.caption,
            },
            false,
          );
        }
      }

      await this.prismaRepository.integrationSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'textGenerator') {
      endpoint += '/completion-messages';
      const payload: any = {
        inputs: {
          query: content,
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.inputs.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      const regex = /!?\[(.*?)\]\((.*?)\)/g;

      const result = [];
      let lastIndex = 0;

      let match;
      while ((match = regex.exec(message)) !== null) {
        if (match.index > lastIndex) {
          result.push({ text: message.slice(lastIndex, match.index).trim() });
        }

        result.push({ caption: match[1], url: match[2] });

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < message.length) {
        result.push({ text: message.slice(lastIndex).trim() });
      }

      for (const item of result) {
        if (item.text) {
          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: item.text,
            },
            false,
          );
        }

        if (item.url) {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'image',
              media: item.url,
              caption: item.caption,
            },
            false,
          );
        }
      }

      await this.prismaRepository.integrationSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'agent') {
      endpoint += '/chat-messages';
      const payload: any = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'streaming',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
        responseType: 'stream',
      });

      let completeMessage = '';
      let conversationId;

      const stream = response.data;
      const reader = new Readable().wrap(stream);

      reader.on('data', (chunk) => {
        const data = chunk.toString();
        const lines = data.split('\n');

        lines.forEach((line) => {
          if (line.startsWith('data: ')) {
            const jsonString = line.substring(6);
            try {
              const event = JSON.parse(jsonString);
              if (event.event === 'agent_message') {
                completeMessage += event.answer;
                conversationId = conversationId ?? event?.conversation_id;
              }
            } catch (error) {
              console.error('Error parsing stream data:', error);
            }
          }
        });
      });

      reader.on('end', async () => {
        await instance.client.sendPresenceUpdate('paused', remoteJid);

        await instance.textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            text: completeMessage,
          },
          false,
        );

        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
            sessionId: conversationId,
          },
        });

        sendTelemetry('/message/sendText');
      });

      reader.on('error', (error) => {
        console.error('Error reading stream:', error);
      });

      return;
    }

    if (dify.botType === 'workflow') {
      endpoint += '/workflows/run';
      const payload: any = {
        inputs: {
          query: content,
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.files = [
          {
            type: 'image',
            transfer_method: 'remote_url',
            url: contentSplit[1].split('?')[0],
          },
        ];
        payload.inputs.query = contentSplit[2] || content;
      }

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.data.outputs.text;

      const regex = /!?\[(.*?)\]\((.*?)\)/g;

      const result = [];
      let lastIndex = 0;

      let match;
      while ((match = regex.exec(message)) !== null) {
        if (match.index > lastIndex) {
          result.push({ text: message.slice(lastIndex, match.index).trim() });
        }

        result.push({ caption: match[1], url: match[2] });

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < message.length) {
        result.push({ text: message.slice(lastIndex).trim() });
      }

      for (const item of result) {
        if (item.text) {
          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: item.text,
            },
            false,
          );
        }

        if (item.url) {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'image',
              media: item.url,
              caption: item.caption,
            },
            false,
          );
        }
      }

      if (settings.keepOpen) {
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.integrationSession.delete({
          where: {
            id: session.id,
          },
        });
      }

      sendTelemetry('/message/sendText');

      return;
    }

    return;
  }
}
