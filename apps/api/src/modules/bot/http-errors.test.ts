import { describe, expect, it, vi } from 'vitest';

import { sendCodedError } from './http-errors.js';

function createReplyMock() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  return { status, send };
}

describe('http-errors', () => {
  it('maps known error code to configured status', () => {
    const reply = createReplyMock();

    sendCodedError(reply as any, { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' }, { PRODUCT_NOT_FOUND: 404 });

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'Product not found' });
  });

  it('uses fallback status and message for unknown value', () => {
    const reply = createReplyMock();

    sendCodedError(reply as any, 'oops', {}, 400, 'Bad request');

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'Bad request' });
  });

  it('uses Error message when code is not mapped', () => {
    const reply = createReplyMock();

    sendCodedError(reply as any, new Error('Something wrong'), {});

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'Something wrong' });
  });
});
