// import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { WAMonitoringService } from '../../../services/monitor.service';

// const logger = new Logger('KwikController');

export class KwikController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async fetchChats({ instanceName }: InstanceDto) {
    const chats = await this.waMonitor.waInstances[instanceName].repository.chat.find({
      where: { owner: instanceName },
    });
    const mm = await Promise.all(
      chats.map(async (chat) => {
        const lastMsg = await this.waMonitor.waInstances[instanceName].repository.message.find({
          where: {
            owner: instanceName,
            key: {
              remoteJid: chat.id,
            },
          },
          limit: 1,
          sort: {
            messageTimestamp: -1,
          },
        });

        return {
          id: chat.id,
          labels: chat.labels,
          owner: chat.owner,
          lastAllMsgTimestamp: lastMsg[0].messageTimestamp,
        };
      }),
    );

    return mm;
  }
}
