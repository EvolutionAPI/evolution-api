import { ForbiddenException } from '../../src/exceptions/403.exception';

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

describe('ForbiddenException', () => {
  const catchThrown = (fn: () => void): any => {
    try {
      fn();
    } catch (thrown) {
      return thrown;
    }
  };

  it('should throw an object with status 403 and default error', () => {
    const error = catchThrown(() => new ForbiddenException());
    
    expect(error).toEqual({
      status: 403,
      error: 'Forbidden',
      message: undefined,
    });
  });

  it('should include a message when provided', () => {
    const error = catchThrown(() => new ForbiddenException('access denied'));
    
    expect(error).toEqual({
      status: 403,
      error: 'Forbidden',
      message: ['access denied'],
    });
  });

  it('should handle multiple error messages', () => {
    const error = catchThrown(() => new ForbiddenException('no rights', 'forbidden'));
    
    expect(error.message).toEqual(['no rights', 'forbidden']);
  });
});
