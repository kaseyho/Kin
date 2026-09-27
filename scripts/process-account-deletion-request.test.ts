import {
  AccountDeletionRequestInputError,
  parseAccountDeletionRequestInput,
} from './process-account-deletion-request.ts';

const userId = 'b20d4b63-10f3-4cc4-bff7-64f74ea3de74';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('requires an exact repeated user ID and a non-PII request reference', () => {
  const parsed = parseAccountDeletionRequestInput([
    '--user-id', userId,
    '--confirm-user-id', userId,
    '--request-reference', 'support-1042',
  ]);

  assert(parsed.userId === userId, 'user ID should be preserved');
  assert(parsed.requestReference === 'support-1042', 'request reference should be preserved');
});

Deno.test('rejects a mismatched confirmation before any provider call', () => {
  try {
    parseAccountDeletionRequestInput([
      '--user-id', userId,
      '--confirm-user-id', 'f7a7fd69-9f20-49ee-ab5b-a1bd9067648d',
      '--request-reference', 'support-1042',
    ]);
    throw new Error('Expected mismatched confirmation to fail');
  } catch (error) {
    assert(error instanceof AccountDeletionRequestInputError, 'a typed input error is required');
    assert(error.code === 'confirmation_mismatch', 'the mismatch code should be explicit');
  }
});

Deno.test('rejects malformed IDs and references containing personal data', () => {
  for (const args of [
    ['--user-id', 'maya@example.com', '--confirm-user-id', 'maya@example.com', '--request-reference', 'support-1042'],
    ['--user-id', userId, '--confirm-user-id', userId, '--request-reference', 'maya@example.com'],
  ]) {
    try {
      parseAccountDeletionRequestInput(args);
      throw new Error('Expected unsafe input to fail');
    } catch (error) {
      assert(error instanceof AccountDeletionRequestInputError, 'a typed input error is required');
      assert(
        error.code === 'invalid_user_id' || error.code === 'invalid_request_reference',
        'unsafe input should be identified',
      );
    }
  }
});
