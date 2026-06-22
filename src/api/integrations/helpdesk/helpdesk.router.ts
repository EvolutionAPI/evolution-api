import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { authGuard } from '@api/guards/auth.guard';
import { instanceExistsGuard, instanceLoggedGuard } from '@api/guards/instance.guard';
import { Request, Response, Router } from 'express';

import { HelpdeskController } from './helpdesk.controller';
import {
  CustomerDto,
  InstanceTenantDto,
  TenantDto,
  TicketDto,
  TicketMessageDto,
  TicketUpdateDto,
} from './dto/helpdesk.dto';
import {
  customerSchema,
  instanceTenantSchema,
  tenantSchema,
  ticketMessageSchema,
  ticketSchema,
  ticketUpdateSchema,
} from './validate/helpdesk.schema';

enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
}

export class HelpdeskRouter extends RouterBroker {
  public readonly router: Router = Router();

  constructor(private readonly helpdeskController: HelpdeskController, ...guards: any[]) {
    super();

    const apikeyGuard = authGuard['apikey'];
    const instanceGuards = [instanceExistsGuard, instanceLoggedGuard, apikeyGuard];

    // Tenant routes
    this.router.post('/tenant', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.dataValidate<TenantDto>({
        request: req,
        schema: tenantSchema,
        ClassRef: TenantDto,
        execute: (_, data) => this.helpdeskController.createTenant(data),
      });
      return res.status(HttpStatus.CREATED).json(response);
    });

    this.router.get('/tenant', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.helpdeskController.listTenants();
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.get('/tenant/:id', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.helpdeskController.getTenant(req.params.id);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.put('/tenant/:id', apikeyGuard, async (req: Request, res: Response) => {
      const { id } = req.params;
      const data = req.body as TenantDto;
      const response = await this.helpdeskController.updateTenant(id, data);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.delete('/tenant/:id', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.helpdeskController.deleteTenant(req.params.id);
      return res.status(HttpStatus.OK).json(response);
    });

    // Customer routes
    this.router.post('/customer', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.dataValidate<CustomerDto>({
        request: req,
        schema: customerSchema,
        ClassRef: CustomerDto,
        execute: (_, data) => this.helpdeskController.createCustomer(data),
      });
      return res.status(HttpStatus.CREATED).json(response);
    });

    this.router.get('/customer', apikeyGuard, async (req: Request, res: Response) => {
      const tenantId = req.query.tenantId as string;
      const response = await this.helpdeskController.listCustomers(tenantId);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.get('/customer/:id', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.helpdeskController.getCustomer(req.params.id);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.put('/customer/:id', apikeyGuard, async (req: Request, res: Response) => {
      const { id } = req.params;
      const data = req.body as Partial<CustomerDto>;
      const response = await this.helpdeskController.updateCustomer(id, data);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.delete('/customer/:id', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.helpdeskController.deleteCustomer(req.params.id);
      return res.status(HttpStatus.OK).json(response);
    });

    // Ticket routes
    this.router.post('/ticket', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.dataValidate<TicketDto>({
        request: req,
        schema: ticketSchema,
        ClassRef: TicketDto,
        execute: (_, data) => this.helpdeskController.createTicket(data),
      });
      return res.status(HttpStatus.CREATED).json(response);
    });

    this.router.get('/ticket', apikeyGuard, async (req: Request, res: Response) => {
      const tenantId = req.query.tenantId as string;
      const customerId = req.query.customerId as string;
      const status = req.query.status as string;
      const response = await this.helpdeskController.listTickets(tenantId, customerId, status);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.get('/ticket/:id', apikeyGuard, async (req: Request, res: Response) => {
      const response = await this.helpdeskController.getTicket(req.params.id);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.put('/ticket/:id', apikeyGuard, async (req: Request, res: Response) => {
      const { id } = req.params;
      const data = req.body as TicketUpdateDto;
      const response = await this.helpdeskController.updateTicket(id, data);
      return res.status(HttpStatus.OK).json(response);
    });

    // Ticket message routes (nested under ticket)
    this.router.post('/ticket/:ticketId/message', apikeyGuard, async (req: Request, res: Response) => {
      const { ticketId } = req.params;
      const response = await this.dataValidate<TicketMessageDto>({
        request: req,
        schema: ticketMessageSchema,
        ClassRef: TicketMessageDto,
        execute: (_, data) => this.helpdeskController.addTicketMessage(ticketId, data),
      });
      return res.status(HttpStatus.CREATED).json(response);
    });

    this.router.get('/ticket/:ticketId/message', apikeyGuard, async (req: Request, res: Response) => {
      const { ticketId } = req.params;
      const response = await this.helpdeskController.getTicketMessages(ticketId);
      return res.status(HttpStatus.OK).json(response);
    });

    // Instance-Tenant linking routes
    this.router.post(this.routerPath('instance/link'), ...instanceGuards, async (req: Request, res: Response) => {
      const response = await this.dataValidate<InstanceTenantDto>({
        request: req,
        schema: instanceTenantSchema,
        ClassRef: InstanceTenantDto,
        execute: (instance, data) => this.helpdeskController.linkInstance(instance, data),
      });
      return res.status(HttpStatus.CREATED).json(response);
    });

    this.router.get(this.routerPath('instance/link'), ...instanceGuards, async (req: Request, res: Response) => {
      const instance = req.params as unknown as InstanceDto;
      const response = await this.helpdeskController.getLinkedTenant(instance);
      return res.status(HttpStatus.OK).json(response);
    });

    this.router.delete(this.routerPath('instance/link'), ...instanceGuards, async (req: Request, res: Response) => {
      const instance = req.params as unknown as InstanceDto;
      const response = await this.helpdeskController.unlinkInstance(instance);
      return res.status(HttpStatus.OK).json(response);
    });
  }
}
