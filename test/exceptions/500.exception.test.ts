import { InternalServerErrorException } from '../../src/exceptions/500.exception';

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

describe('InternalServerErrorException', () => {
  const catchThrown = (fn: () => void): any => {
    try {
      fn();
    } catch (thrown) {
      return thrown;
    }
  };

  it('should throw an object with status 500 and default error', () => {
    const error = catchThrown(() => new InternalServerErrorException());
    
    expect(error).toEqual({
      status: 500,
      error: 'Internal Server Error',
      message: undefined,
    });
  });

  it('should include a message when provided', () => {
    const error = catchThrown(() => new InternalServerErrorException('db connection failed'));
    
    expect(error).toEqual({
      status: 500,
      error: 'Internal Server Error',
      message: ['db connection failed'],
    });
  });

  it('should handle multiple error messages', () => {
    const error = catchThrown(() => new InternalServerErrorException('error 1', 'error 2'));
    
    expect(error.message).toEqual(['error 1', 'error 2']);
  });

  it('should handle an Error instance as message', () => {
    const err = new Error('critical failure');
    const error = catchThrown(() => new InternalServerErrorException(err));
    
    expect(error.message).toEqual([err]);
  });
});
