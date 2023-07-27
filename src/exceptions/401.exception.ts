import { HttpStatus } from '../whatsapp/routers/index.router';

export class UnauthorizedException {
  constructor(...objectError: any[]) {
    throw {
      status: HttpStatus.UNAUTHORIZED,
      error: 'Unauthorized',
      message: objectError.length > 0 ? objectError : 'Unauthorized',
    };
  }
}
