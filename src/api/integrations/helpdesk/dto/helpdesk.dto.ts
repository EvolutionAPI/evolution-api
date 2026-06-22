export class TenantDto {
  name: string;
}

export class CustomerDto {
  phoneNumber: string;
  name?: string;
  email?: string;
  tenantId: string;
}

export class TicketDto {
  subject: string;
  description?: string;
  status?: string;
  category?: string;
  source?: string;
  tenantId: string;
  customerId: string;
}

export class TicketUpdateDto {
  subject?: string;
  description?: string;
  status?: string;
  category?: string;
}

export class InstanceTenantDto {
  tenantId: string;
}

export class TicketMessageDto {
  content: string;
  fromWhatsApp?: boolean;
}
