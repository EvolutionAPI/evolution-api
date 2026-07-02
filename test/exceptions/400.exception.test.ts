jest.mock('../../src/api/routes/index.router', () => ({
  HttpStatus: { BAD_REQUEST: 400 }
}));

import { BadRequestException } from '../../src/exceptions/400.exception';

describe('BadRequestException', () => {
  it('should initialize with status 400 and default error when no arguments are provided', () => {
    try {
      new BadRequestException();
    } catch (error: any) {
      expect(error.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toBeUndefined();
    }
  });

  it('should format a single string argument as an array in the message property', () => {
    const customMessage = 'Missing required fields';
    
    try {
      new BadRequestException(customMessage);
    } catch (error: any) {
      expect(error.status).toBe(400);
      expect(error.message).toEqual([customMessage]);
    }
  });

  it('should format a single object argument as an array in the message property', () => {
    const customObj = { field: 'email', error: 'invalid format' };
    
    try {
      new BadRequestException(customObj);
    } catch (error: any) {
      expect(error.message).toEqual([customObj]);
    }
  });

  it('should handle multiple mixed arguments properly', () => {
    try {
      new BadRequestException('Error 1', { reason: 'unknown' }, null, undefined);
    } catch (error: any) {
      expect(error.message).toEqual(['Error 1', { reason: 'unknown' }, null, undefined]);
    }
  });
});
