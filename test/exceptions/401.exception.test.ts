import { UnauthorizedException } from '../../src/exceptions/401.exception';

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

describe('UnauthorizedException', () => {
  const catchThrown = (fn: () => void): any => {
    try {
      fn();
    } catch (thrown) {
      return thrown;
    }
  };

  it('should throw an object with status 401 and fallback message', () => {
    const error = catchThrown(() => new UnauthorizedException());
    
    expect(error).toEqual({
      status: 401,
      error: 'Unauthorized',
      message: 'Unauthorized',
    });
  });

  it('should include a custom message when provided', () => {
    const error = catchThrown(() => new UnauthorizedException('token expired'));
    
    expect(error).toEqual({
      status: 401,
      error: 'Unauthorized',
      message: ['token expired'],
    });
  });

  it('should handle multiple error messages', () => {
    const error = catchThrown(() => new UnauthorizedException('invalid', 'expired'));
    
    expect(error.message).toEqual(['invalid', 'expired']);
  });
});
