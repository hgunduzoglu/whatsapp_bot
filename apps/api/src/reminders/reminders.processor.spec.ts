import { isReengagementError } from './reminders.processor';

describe('isReengagementError', () => {
  it('detects the Meta re-engagement error code', () => {
    const error = new Error(
      'WhatsApp send failed with status 400: {"error":{"code":131047,"message":"Re-engagement message"}}',
    );
    expect(isReengagementError(error)).toBe(true);
  });

  it('detects the error by name as well', () => {
    expect(isReengagementError(new Error('Re-engagement message required'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isReengagementError(new Error('WhatsApp send failed with status 401: bad token'))).toBe(
      false,
    );
    expect(isReengagementError('not an error')).toBe(false);
  });
});
