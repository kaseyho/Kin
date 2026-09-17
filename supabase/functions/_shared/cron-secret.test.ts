import { secureSecretEqual } from './cron-secret.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('scheduled worker secrets require an exact non-empty match', () => {
  const secret = '0123456789abcdef0123456789abcdef';
  assert(secureSecretEqual(secret, secret), 'matching secrets should authorize');
  assert(!secureSecretEqual(null, secret), 'a missing request secret must fail');
  assert(!secureSecretEqual(secret, undefined), 'missing configuration must fail');
  assert(!secureSecretEqual(`${secret}x`, secret), 'a different length must fail');
  assert(!secureSecretEqual(`${secret.slice(0, -1)}0`, secret), 'different bytes must fail');
});
