import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { BadRequestException, NotFoundException } from '@exceptions';

import { CustomerDto, InstanceTenantDto, TenantDto, TicketDto, TicketMessageDto, TicketUpdateDto } from './dto/helpdesk.dto';

export class HelpdeskService {
  private readonly logger = new Logger('HelpdeskService');

  private readonly CONVERSATION_TIMEOUT = 10 * 60 * 1000;

  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private async generateTicketNumber(): Promise<string> {
    const lastTicket = await this.prismaRepository.ticket.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { ticketNumber: true },
    });

    let nextNum = 1;
    if (lastTicket) {
      const match = lastTicket.ticketNumber.match(/INC-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }

    return `INC-${String(nextNum).padStart(5, '0')}`;
  }

  private async sendWhatsAppMessage(instance: any, remoteJid: string, text: string): Promise<void> {
    if (!instance) return;

    try {
      await instance.textMessage(
        {
          number: remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid,
          delay: 1000,
          text,
          linkPreview: false,
        },
        false,
      );
    } catch (error) {
      this.logger.error(`Error sending WhatsApp message: ${error}`);
    }
  }

  async createTenant(data: TenantDto) {
    const existing = await this.prismaRepository.tenant.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new BadRequestException('Tenant with this name already exists');
    }

    return this.prismaRepository.tenant.create({ data: { name: data.name } });
  }

  async listTenants() {
    return this.prismaRepository.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getTenant(id: string) {
    const tenant = await this.prismaRepository.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateTenant(id: string, data: TenantDto) {
    await this.getTenant(id);
    return this.prismaRepository.tenant.update({ where: { id }, data: { name: data.name } });
  }

  async deleteTenant(id: string) {
    await this.getTenant(id);
    await this.prismaRepository.tenant.delete({ where: { id } });
    return { tenant: { id } };
  }

  async createCustomer(data: CustomerDto) {
    await this.getTenant(data.tenantId);

    const existing = await this.prismaRepository.customer.findUnique({
      where: { phoneNumber_tenantId: { phoneNumber: data.phoneNumber, tenantId: data.tenantId } },
    });

    if (existing) {
      throw new BadRequestException('Customer with this phone number already exists in this tenant');
    }

    return this.prismaRepository.customer.create({ data });
  }

  async listCustomers(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.prismaRepository.customer.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async getCustomer(id: string) {
    const customer = await this.prismaRepository.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async updateCustomer(id: string, data: Partial<CustomerDto>) {
    await this.getCustomer(id);
    return this.prismaRepository.customer.update({ where: { id }, data });
  }

  async deleteCustomer(id: string) {
    await this.getCustomer(id);
    await this.prismaRepository.customer.delete({ where: { id } });
    return { customer: { id } };
  }

  async findCustomerByPhone(phoneNumber: string, tenantId: string) {
    return this.prismaRepository.customer.findUnique({
      where: { phoneNumber_tenantId: { phoneNumber, tenantId } },
    });
  }

  async linkCustomerToPhone(customerId: string, phoneNumber: string) {
    return this.prismaRepository.customer.update({
      where: { id: customerId },
      data: { phoneNumber },
    });
  }

  async createTicket(data: TicketDto) {
    await this.getTenant(data.tenantId);
    await this.getCustomer(data.customerId);

    const ticketNumber = await this.generateTicketNumber();

    return this.prismaRepository.ticket.create({
      data: {
        ticketNumber,
        subject: data.subject,
        description: data.description || '',
        status: data.status || 'open',
        category: data.category,
        source: data.source || 'whatsapp',
        tenantId: data.tenantId,
        customerId: data.customerId,
      },
    });
  }

  async listTickets(tenantId?: string, customerId?: string, status?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    return this.prismaRepository.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { Customer: true },
    });
  }

  async getTicket(id: string) {
    const ticket = await this.prismaRepository.ticket.findUnique({
      where: { id },
      include: {
        Customer: true,
        Tenant: true,
        TicketMessage: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async updateTicket(id: string, data: TicketUpdateDto) {
    await this.getTicket(id);

    const updateData: any = {};
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.category !== undefined) updateData.category = data.category;

    return this.prismaRepository.ticket.update({ where: { id }, data: updateData });
  }

  async addTicketMessage(ticketId: string, data: TicketMessageDto) {
    await this.getTicket(ticketId);

    return this.prismaRepository.ticketMessage.create({
      data: {
        content: data.content,
        fromWhatsApp: data.fromWhatsApp !== false,
        ticketId,
      },
    });
  }

  async getTicketMessages(ticketId: string) {
    await this.getTicket(ticketId);

    return this.prismaRepository.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async linkInstance(instanceName: string, tenantId: string) {
    await this.getTenant(tenantId);

    const instance = await this.prismaRepository.instance.findUnique({
      where: { name: instanceName },
    });

    if (!instance) {
      throw new NotFoundException('Instance not found');
    }

    const existing = await this.prismaRepository.instanceTenant.findUnique({
      where: { instanceId: instance.id },
    });

    if (existing) {
      return this.prismaRepository.instanceTenant.update({
        where: { id: existing.id },
        data: { tenantId },
        include: { Tenant: true },
      });
    }

    return this.prismaRepository.instanceTenant.create({
      data: { instanceId: instance.id, tenantId },
      include: { Tenant: true },
    });
  }

  async getLinkedTenant(instanceName: string) {
    const instance = await this.prismaRepository.instance.findUnique({
      where: { name: instanceName },
    });

    if (!instance) throw new NotFoundException('Instance not found');

    const link = await this.prismaRepository.instanceTenant.findUnique({
      where: { instanceId: instance.id },
      include: { Tenant: true },
    });

    if (!link) return null;

    return { instanceName, tenant: link.Tenant };
  }

  async unlinkInstance(instanceName: string) {
    const instance = await this.prismaRepository.instance.findUnique({
      where: { name: instanceName },
    });

    if (!instance) throw new NotFoundException('Instance not found');

    const link = await this.prismaRepository.instanceTenant.findUnique({
      where: { instanceId: instance.id },
    });

    if (link) {
      await this.prismaRepository.instanceTenant.delete({ where: { id: link.id } });
    }

    return { instanceName, unlinked: true };
  }

  async processIncomingMessage(
    instance: { instanceName: string; instanceId: string },
    remoteJid: string,
    content: string,
    pushName?: string,
  ): Promise<void> {
    try {
      const phoneNumber = remoteJid.split('@')[0];

      const link = await this.prismaRepository.instanceTenant.findUnique({
        where: { instanceId: instance.instanceId },
      });

      if (!link) return;

      const tenantId = link.tenantId;

      const tenant = await this.prismaRepository.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return;

      let customer = await this.prismaRepository.customer.findUnique({
        where: { phoneNumber_tenantId: { phoneNumber, tenantId } },
      });

      let session = await this.prismaRepository.whatsappSession.findUnique({
        where: { phoneNumber_tenantId: { phoneNumber, tenantId } },
      });

      const waInstance = this.waMonitor.waInstances[instance.instanceName];
      if (!waInstance) {
        this.logger.warn(`Instance ${instance.instanceName} not found in monitor`);
        return;
      }

      const now = new Date();

      if (!session) {
        if (!customer) {
          customer = await this.prismaRepository.customer.create({
            data: {
              phoneNumber,
              name: pushName || phoneNumber,
              tenantId,
            },
          });
        }

        session = await this.prismaRepository.whatsappSession.create({
          data: {
            phoneNumber,
            tenantId,
            customerId: customer.id,
            state: 'MAIN_MENU',
            lastActivity: now,
          },
        });

        const welcomeMessage = [
          `*Welcome to ${tenant.name} Support* 🎉`,
          '',
          'How can we help you today?',
          '',
          '1️⃣ *Create Ticket* - Open a new support request',
          '2️⃣ *Check Ticket* - Check status of existing ticket',
          '3️⃣ *Speak to Agent* - Request human assistance',
          '',
          'Reply with the number of your choice.',
        ].join('\n');

        await this.sendWhatsAppMessage(waInstance, remoteJid, welcomeMessage);
        return;
      }

      const timeSinceLastActivity = now.getTime() - new Date(session.lastActivity).getTime();
      if (timeSinceLastActivity > this.CONVERSATION_TIMEOUT) {
        session = await this.prismaRepository.whatsappSession.update({
          where: { id: session.id },
          data: { state: 'MAIN_MENU', lastActivity: now },
        });
      } else {
        await this.prismaRepository.whatsappSession.update({
          where: { id: session.id },
          data: { lastActivity: now },
        });
      }

      switch (session.state) {
        case 'MAIN_MENU':
          await this.handleMainMenu(waInstance, remoteJid, session, content, tenant, phoneNumber);
          break;

        case 'WAITING_DESCRIPTION':
          await this.handleWaitingDescription(waInstance, remoteJid, session, content, phoneNumber);
          break;

        case 'WAITING_CATEGORY':
          await this.handleWaitingCategory(waInstance, remoteJid, session, content, phoneNumber);
          break;

        case 'CONFIRM_TICKET':
          await this.handleConfirmTicket(waInstance, remoteJid, session, content, phoneNumber);
          break;

        default:
          await this.prismaRepository.whatsappSession.update({
            where: { id: session.id },
            data: { state: 'MAIN_MENU', lastActivity: now },
          });

          await this.sendWhatsAppMessage(
            waInstance,
            remoteJid,
            'Session expired. Please start again.\n\n1️⃣ *Create Ticket*\n2️⃣ *Check Ticket*\n3️⃣ *Speak to Agent*',
          );
          break;
      }
    } catch (error) {
      this.logger.error(`Error processing helpdesk message: ${error}`);
    }
  }

  private async handleMainMenu(
    waInstance: any,
    remoteJid: string,
    session: any,
    content: string,
    tenant: any,
    phoneNumber: string,
  ): Promise<void> {
    const choice = content.trim();

    if (choice === '1' || choice.toLowerCase().includes('create') || choice.toLowerCase().includes('ticket')) {
      await this.prismaRepository.whatsappSession.update({
        where: { id: session.id },
        data: {
          state: 'WAITING_DESCRIPTION',
          ticketDraft: {},
        },
      });

      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        'Please describe your issue in a few words so we can create a support ticket.',
      );
    } else if (choice === '2' || choice.toLowerCase().includes('check')) {
      const tickets = await this.prismaRepository.ticket.findMany({
        where: { customerId: session.customerId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (tickets.length === 0) {
        await this.sendWhatsAppMessage(
          waInstance,
          remoteJid,
          'You have no existing tickets. Would you like to create one?\n\n1️⃣ *Create Ticket*\n2️⃣ *Main Menu*',
        );
      } else {
        const ticketList = tickets
          .map((t) => `• *${t.ticketNumber}* - ${t.subject} (${t.status})`)
          .join('\n');

        await this.sendWhatsAppMessage(
          waInstance,
          remoteJid,
          `Your recent tickets:\n\n${ticketList}\n\nReply with a ticket number for details, or:\n1️⃣ *Create Ticket*\n2️⃣ *Main Menu*`,
        );
      }
    } else if (choice === '3' || choice.toLowerCase().includes('speak') || choice.toLowerCase().includes('agent')) {
      const tickets = await this.prismaRepository.ticket.findMany({
        where: { customerId: session.customerId, status: { not: 'closed' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      if (tickets.length > 0) {
        await this.sendWhatsAppMessage(
          waInstance,
          remoteJid,
          `An agent has been notified about ticket *${tickets[0].ticketNumber}*. They will respond to you shortly.\n\nYour ticket: *${tickets[0].ticketNumber}*`,
        );
      } else {
        await this.sendWhatsAppMessage(
          waInstance,
          remoteJid,
          'Please create a ticket first so we can assign an agent.\n\n1️⃣ *Create Ticket*\n2️⃣ *Main Menu*',
        );
      }
    } else {
      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        'Please choose a valid option:\n\n1️⃣ *Create Ticket*\n2️⃣ *Check Ticket*\n3️⃣ *Speak to Agent*',
      );
    }
  }

  private async handleWaitingDescription(
    waInstance: any,
    remoteJid: string,
    session: any,
    content: string,
    phoneNumber: string,
  ): Promise<void> {
    const description = content.trim();

    if (description.length < 3) {
      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        'Please provide a brief description of your issue (at least 3 characters).',
      );
      return;
    }

    const subject = description.length > 100 ? description.substring(0, 97) + '...' : description;

    await this.prismaRepository.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: 'WAITING_CATEGORY',
        ticketDraft: { subject, description },
      },
    });

    const categoryMessage = [
      'Thanks! Which category best describes your issue?',
      '',
      '1️⃣ *Network* - Internet, connectivity',
      '2️⃣ *Billing* - Payments, invoices',
      '3️⃣ *Technical Support* - Software, hardware',
      '4️⃣ *Other* - General inquiries',
      '',
      'Reply with the number of your choice.',
    ].join('\n');

    await this.sendWhatsAppMessage(waInstance, remoteJid, categoryMessage);
  }

  private async handleWaitingCategory(
    waInstance: any,
    remoteJid: string,
    session: any,
    content: string,
    phoneNumber: string,
  ): Promise<void> {
    const choice = content.trim();
    let category: string;

    if (choice === '1' || choice.toLowerCase().includes('network')) {
      category = 'Network';
    } else if (choice === '2' || choice.toLowerCase().includes('billing')) {
      category = 'Billing';
    } else if (choice === '3' || choice.toLowerCase().includes('technical')) {
      category = 'Technical Support';
    } else if (choice === '4' || choice.toLowerCase().includes('other')) {
      category = 'Other';
    } else {
      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        'Please choose a valid category:\n\n1️⃣ *Network*\n2️⃣ *Billing*\n3️⃣ *Technical Support*\n4️⃣ *Other*',
      );
      return;
    }

    const draft = (session.ticketDraft as any) || {};

    await this.prismaRepository.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: 'CONFIRM_TICKET',
        ticketDraft: { ...draft, category },
      },
    });

    const confirmMessage = [
      'Please confirm your ticket details:',
      '',
      `*Issue:* ${draft.subject || ''}`,
      `*Category:* ${category}`,
      '',
      '1️⃣ *Submit* - Create the ticket',
      '2️⃣ *Cancel* - Discard and go back',
      '3️⃣ *Edit Description* - Change the description',
    ].join('\n');

    await this.sendWhatsAppMessage(waInstance, remoteJid, confirmMessage);
  }

  private async handleConfirmTicket(
    waInstance: any,
    remoteJid: string,
    session: any,
    content: string,
    phoneNumber: string,
  ): Promise<void> {
    const choice = content.trim();

    if (choice === '1' || choice.toLowerCase().includes('submit') || choice.toLowerCase().includes('yes')) {
      const draft = (session.ticketDraft as any) || {};

      if (!draft.subject) {
        await this.prismaRepository.whatsappSession.update({
          where: { id: session.id },
          data: { state: 'WAITING_DESCRIPTION' },
        });

        await this.sendWhatsAppMessage(
          waInstance,
          remoteJid,
          'Something went wrong with your draft. Please describe your issue again:',
        );
        return;
      }

      const customer = await this.prismaRepository.customer.findUnique({
        where: { id: session.customerId },
      });

      if (!customer) {
        await this.sendWhatsAppMessage(
          waInstance,
          remoteJid,
          'Customer record not found. Please contact support.',
        );
        return;
      }

      const ticket = await this.createTicket({
        subject: draft.subject,
        description: draft.description || draft.subject,
        category: draft.category || 'Other',
        source: 'whatsapp',
        tenantId: session.tenantId,
        customerId: session.customerId,
      });

      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        [
          `✅ *Ticket Created Successfully!*`,
          '',
          `*Ticket:* ${ticket.ticketNumber}`,
          `*Status:* Open`,
          `*Issue:* ${draft.subject}`,
          '',
          'An agent will follow up with you soon.',
          '',
          '1️⃣ *Create Another Ticket*',
          '2️⃣ *Main Menu*',
        ].join('\n'),
      );

      await this.prismaRepository.whatsappSession.update({
        where: { id: session.id },
        data: {
          state: 'MAIN_MENU',
          ticketDraft: null,
        },
      });
    } else if (choice === '2' || choice.toLowerCase().includes('cancel') || choice.toLowerCase().includes('no')) {
      await this.prismaRepository.whatsappSession.update({
        where: { id: session.id },
        data: {
          state: 'MAIN_MENU',
          ticketDraft: null,
        },
      });

      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        'Ticket creation cancelled.\n\n1️⃣ *Create Ticket*\n2️⃣ *Check Ticket*\n3️⃣ *Speak to Agent*',
      );
    } else if (choice === '3' || choice.toLowerCase().includes('edit')) {
      await this.prismaRepository.whatsappSession.update({
        where: { id: session.id },
        data: { state: 'WAITING_DESCRIPTION' },
      });

      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        'Please provide a new description for your issue:',
      );
    } else {
      await this.sendWhatsAppMessage(
        waInstance,
        remoteJid,
        'Please choose:\n\n1️⃣ *Submit*\n2️⃣ *Cancel*\n3️⃣ *Edit Description*',
      );
    }
  }
}
