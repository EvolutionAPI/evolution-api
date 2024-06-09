import { Events } from '../../../../validate/validate.schema';
import { InstanceDto } from '../../../dto/instance.dto';
import { WebsocketDto } from '../dto/websocket.dto';
import { WebsocketService } from '../services/websocket.service';

export class WebsocketController {
  constructor(private readonly websocketService: WebsocketService) {}

  public async createWebsocket(instance: InstanceDto, data: WebsocketDto) {
    if (!data.enabled) {
      data.events = [];
    }

    if (data.events.length === 0) {
      data.events = Events;
    }

    return this.websocketService.create(instance, data);
  }

  public async findWebsocket(instance: InstanceDto) {
    return this.websocketService.find(instance);
  }
}
