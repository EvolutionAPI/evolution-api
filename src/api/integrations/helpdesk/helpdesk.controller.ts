import { InstanceDto } from '@api/dto/instance.dto';
import { WAMonitoringService } from '@api/services/monitor.service';

import { CustomerDto, InstanceTenantDto, TenantDto, TicketDto, TicketMessageDto, TicketUpdateDto } from './dto/helpdesk.dto';
import { HelpdeskService } from './helpdesk.service';

export class HelpdeskController {
  constructor(
    private readonly helpdeskService: HelpdeskService,
    private readonly waMonitor: WAMonitoringService,
  ) {}

  public async createTenant(data: TenantDto) {
    return this.helpdeskService.createTenant(data);
  }

  public async listTenants() {
    return this.helpdeskService.listTenants();
  }

  public async getTenant(id: string) {
    return this.helpdeskService.getTenant(id);
  }

  public async updateTenant(id: string, data: TenantDto) {
    return this.helpdeskService.updateTenant(id, data);
  }

  public async deleteTenant(id: string) {
    return this.helpdeskService.deleteTenant(id);
  }

  public async createCustomer(data: CustomerDto) {
    return this.helpdeskService.createCustomer(data);
  }

  public async listCustomers(tenantId?: string) {
    return this.helpdeskService.listCustomers(tenantId);
  }

  public async getCustomer(id: string) {
    return this.helpdeskService.getCustomer(id);
  }

  public async updateCustomer(id: string, data: Partial<CustomerDto>) {
    return this.helpdeskService.updateCustomer(id, data);
  }

  public async deleteCustomer(id: string) {
    return this.helpdeskService.deleteCustomer(id);
  }

  public async createTicket(data: TicketDto) {
    return this.helpdeskService.createTicket(data);
  }

  public async listTickets(tenantId?: string, customerId?: string, status?: string) {
    return this.helpdeskService.listTickets(tenantId, customerId, status);
  }

  public async getTicket(id: string) {
    return this.helpdeskService.getTicket(id);
  }

  public async updateTicket(id: string, data: TicketUpdateDto) {
    return this.helpdeskService.updateTicket(id, data);
  }

  public async addTicketMessage(ticketId: string, data: TicketMessageDto) {
    return this.helpdeskService.addTicketMessage(ticketId, data);
  }

  public async getTicketMessages(ticketId: string) {
    return this.helpdeskService.getTicketMessages(ticketId);
  }

  public async linkInstance(instance: InstanceDto, data: InstanceTenantDto) {
    return this.helpdeskService.linkInstance(instance.instanceName, data.tenantId);
  }

  public async getLinkedTenant(instance: InstanceDto) {
    return this.helpdeskService.getLinkedTenant(instance.instanceName);
  }

  public async unlinkInstance(instance: InstanceDto) {
    return this.helpdeskService.unlinkInstance(instance.instanceName);
  }

  public async processIncomingMessage(
    instance: { instanceName: string; instanceId: string },
    remoteJid: string,
    content: string,
    pushName?: string,
  ): Promise<void> {
    return this.helpdeskService.processIncomingMessage(instance, remoteJid, content, pushName);
  }
}
