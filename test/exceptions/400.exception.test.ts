import { BadRequestException } from '../../src/exceptions/400.exception';

jest.mock('../../src/api/routes/index.router', () => ({
  HttpStatus: {
    OK: 200,
    CREATED: 201,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

describe('BadRequestException', () => {
  const catchThrown = (fn: () => void): any => {
    try {
      fn();
    } catch (thrown) {
      return thrown;
    }
  };

  it('should throw an object with status 400 and default error', () => {
    const error = catchThrown(() => new BadRequestException());
    
    expect(error).toEqual({
      status: 400,
      error: 'Bad Request',
      message: undefined,
    });
  });

  it('should include a single message when provided', () => {
    const error = catchThrown(() => new BadRequestException('invalid data'));
    
    expect(error).toEqual({
      status: 400,
      error: 'Bad Request',
      message: ['invalid data'],
    });
  });

  it('should handle multiple error messages', () => {
    const error = catchThrown(() => new BadRequestException('error 1', 'error 2'));
    
    expect(error.message).toEqual(['error 1', 'error 2']);
  });

  it('should handle objects as messages', () => {
    const detail = { field: 'email' };
    const error = catchThrown(() => new BadRequestException(detail));
    
    expect(error.message).toEqual([detail]);
  });
});
