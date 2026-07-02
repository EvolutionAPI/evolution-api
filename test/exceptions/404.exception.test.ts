import { NotFoundException } from '../../src/exceptions/404.exception';

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

describe('NotFoundException', () => {
  const catchThrown = (fn: () => void): any => {
    try {
      fn();
    } catch (thrown) {
      return thrown;
    }
  };

  it('should throw an object with status 404 and default error', () => {
    const error = catchThrown(() => new NotFoundException());
    
    expect(error).toEqual({
      status: 404,
      error: 'Not Found',
      message: undefined,
    });
  });

  it('should include a message when provided', () => {
    const error = catchThrown(() => new NotFoundException('instance not found'));
    
    expect(error).toEqual({
      status: 404,
      error: 'Not Found',
      message: ['instance not found'],
    });
  });

  it('should handle multiple error messages', () => {
    const error = catchThrown(() => new NotFoundException('missing', 'invalid id'));
    
    expect(error.message).toEqual(['missing', 'invalid id']);
  });

  it('should handle numbers as messages', () => {
    const error = catchThrown(() => new NotFoundException(123));
    
    expect(error.message).toEqual([123]);
  });
});
