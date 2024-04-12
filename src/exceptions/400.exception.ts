import { HttpStatus } from '../api/routers/index.router';

export class BadRequestException {
  constructor(...objectError: any[]) {
    throw {
      status: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: objectError.length > 0 ? objectError : undefined,
    };
  }
}
