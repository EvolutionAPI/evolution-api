jest.mock('../../src/api/routes/index.router', () => ({
  HttpStatus: { BAD_REQUEST: 400 }
}));

import { createMetaErrorResponse } from '../../src/utils/errorResponse';

describe('createMetaErrorResponse', () => {
  it('should extract fields from a fully populated Meta error object', () => {
    const mockError = {
      message: 'Message template not found',
      code: 100,
      type: 'OAuthException',
      error_user_title: 'Template not found',
      error_user_msg: 'The specified template does not exist.',
      error_subcode: 2388102,
      fbtrace_id: 'Axyz123'
    };

    const response = createMetaErrorResponse(mockError, 'template_creation');

    expect(response.status).toBe(400);
    expect(response.message).toBe('Template not found');
    expect(response.details.whatsapp_error).toBe('The specified template does not exist.');
    expect(response.details.whatsapp_code).toBe(100);
    expect(response.details.error_type).toBe('OAuthException');
    expect(response.details.error_subcode).toBe(2388102);
    expect(response.details.fbtrace_id).toBe('Axyz123');
    expect(response.details.context).toBe('template_creation');
    expect(response.timestamp).toBeDefined();
  });

  it('should fallback to message property when error_user_title and error_user_msg are missing', () => {
    const mockError = { message: 'Internal server failure' };
    const response = createMetaErrorResponse(mockError, 'unknown_context');

    expect(response.message).toBe('Internal server failure');
    expect(response.details.whatsapp_error).toBe('Internal server failure');
  });

  it('should fallback to "Unknown error" when no descriptive fields are provided', () => {
    const mockError = { code: 500 };
    const response = createMetaErrorResponse(mockError, 'empty_context');

    expect(response.message).toBe('Unknown error');
    expect(response.details.whatsapp_error).toBe('Unknown error');
    expect(response.details.whatsapp_code).toBe(500);
  });

  it('should fallback to defaults when properties like code, type, subcode, and fbtrace_id are missing', () => {
    const mockError = { message: 'Minimal error' };
    const response = createMetaErrorResponse(mockError, 'minimal_context');

    expect(response.details.whatsapp_code).toBe('UNKNOWN_ERROR');
    expect(response.details.error_type).toBe('UNKNOWN');
    expect(response.details.error_subcode).toBeNull();
    expect(response.details.fbtrace_id).toBeNull();
  });

  it('should extract error fields when they are nested inside a "template" property', () => {
    const mockError = {
      template: {
        error_user_title: 'Nested error title',
        error_user_msg: 'Nested error msg',
        code: 999
      }
    };

    const response = createMetaErrorResponse(mockError, 'nested_context');

    expect(response.message).toBe('Nested error title');
    expect(response.details.whatsapp_error).toBe('Nested error msg');
    expect(response.details.whatsapp_code).toBe(999);
  });
});