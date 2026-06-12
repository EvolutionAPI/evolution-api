import { HttpStatus } from '@api/routes/index.router';

export class TooManyRequestsException {
  constructor(retryAfter?: number, ...objectError: any[]) {
    throw {
      status: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      retryAfter,
      message: objectError.length > 0 ? objectError : undefined,
    };
  }
}
