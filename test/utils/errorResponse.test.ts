import { createMetaErrorResponse } from '../../src/utils/errorResponse';

jest.mock('../../src/api/routes/index.router', () => ({
  HttpStatus: {
    BAD_REQUEST: 400,
  },
}));

describe('createMetaErrorResponse', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const context = 'test_context';

  it('should process a complete Meta error object', () => {
    const metaError = {
      error_user_title: 'Title from Meta',
      error_user_msg: 'Message from Meta',
      code: '1337',
      type: 'OAuthException',
      error_subcode: '123',
      fbtrace_id: 'trace-abc',
    };

    const result = createMetaErrorResponse(metaError, context);

    expect(result.status).toBe(400);
    expect(result.message).toBe('Title from Meta');
    expect(result.details.whatsapp_error).toBe('Message from Meta');
    expect(result.details.whatsapp_code).toBe('1337');
    expect(result.details.error_type).toBe('OAuthException');
    expect(result.details.error_subcode).toBe('123');
    expect(result.details.fbtrace_id).toBe('trace-abc');
    expect(result.details.context).toBe(context);
  });

  it('should fallback to message property for standard errors', () => {
    const standardError = {
      message: 'Standard Error Message',
      code: '500',
    };

    const result = createMetaErrorResponse(standardError, context);

    expect(result.message).toBe('Standard Error Message');
    expect(result.details.whatsapp_error).toBe('Standard Error Message');
    expect(result.details.whatsapp_code).toBe('500');
  });

  it('should process an error wrapped in a template property', () => {
    const wrappedError = {
      template: {
        error_user_title: 'Template Title',
        error_user_msg: 'Template Message',
        code: '999',
      },
    };

    const result = createMetaErrorResponse(wrappedError, context);

    expect(result.message).toBe('Template Title');
    expect(result.details.whatsapp_error).toBe('Template Message');
    expect(result.details.whatsapp_code).toBe('999');
  });

  it('should apply fallback values when properties are missing', () => {
    const emptyError = {};

    const result = createMetaErrorResponse(emptyError, context);

    expect(result.message).toBe('Unknown error');
    expect(result.details.whatsapp_error).toBe('Unknown error');
    expect(result.details.whatsapp_code).toBe('UNKNOWN_ERROR');
    expect(result.details.error_type).toBe('UNKNOWN');
    expect(result.details.error_subcode).toBeNull();
    expect(result.details.fbtrace_id).toBeNull();
  });

  it('should throw TypeError when error is null or undefined', () => {
    expect(() => createMetaErrorResponse(null, context)).toThrow(TypeError);
    expect(() => createMetaErrorResponse(undefined as any, context)).toThrow(TypeError);
  });
});