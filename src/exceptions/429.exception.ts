import { HttpStatus } from '@api/routes/index.router';

export class TooManyRequestsException extends Error {
  public readonly status = HttpStatus.TOO_MANY_REQUESTS;
  public readonly error = 'Too Many Requests';
  public readonly retryAfter?: number;
  public readonly details?: any[];

  constructor(retryAfter?: number, ...objectError: any[]) {
    super('Too Many Requests');
    this.retryAfter = retryAfter;
    this.details = objectError.length > 0 ? objectError : undefined;
  }
}
