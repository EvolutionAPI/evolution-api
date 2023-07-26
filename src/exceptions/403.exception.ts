import { HttpStatus } from '../whatsapp/routers/index.router';

export class ForbiddenException {
  constructor(...objectError: any[]) {
    throw {
      status: HttpStatus.FORBIDDEN,
      error: 'Forbidden',
      message: objectError.length > 0 ? objectError : undefined,
    };
  }
}
