import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountError } from '../contracts';
import { createSupabaseAccountService } from '../supabase';

function createClientDouble() {
  const events: string[] = [];
  const auth = {
    getSession: jest.fn(async () => ({
      data: { session: { access_token: 'access-token' } },
      error: null,
    })),
    signInWithOtp: jest.fn(async () => ({ data: {}, error: null })),
    signOut: jest.fn(async () => {
      events.push('sign-out');
      return { error: null };
    }),
    verifyOtp: jest.fn(async () => ({ data: {}, error: null })),
  };
  const functions = {
    invoke: jest.fn(async (name: string) => {
      events.push(name);
      if (name === 'export-account') {
        return {
          data: { exportedAt: '2026-09-16T00:00:00.000Z', profile: null, version: 1 },
          error: null,
        };
      }
      return { data: { deleted: true }, error: null };
    }),
  };
  return {
    auth,
    client: { auth, functions } as unknown as SupabaseClient,
    events,
    functions,
  };
}

describe('createSupabaseAccountService', () => {
  it('requests a fresh OTP without creating another account', async () => {
    const fake = createClientDouble();

    await createSupabaseAccountService(fake.client).requestFreshOtp('  Maya@Example.com ');

    expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'maya@example.com',
      options: { shouldCreateUser: false },
    });
  });

  it('rejects malformed fresh OTP input before the provider call', async () => {
    const fake = createClientDouble();

    await expect(
      createSupabaseAccountService(fake.client).verifyFreshOtp('maya@example.com', '12345'),
    ).rejects.toMatchObject({ code: 'reauth_required' });
    expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('returns a versioned authenticated export', async () => {
    const fake = createClientDouble();

    await expect(createSupabaseAccountService(fake.client).exportData()).resolves.toMatchObject({
      exportedAt: '2026-09-16T00:00:00.000Z',
      version: 1,
    });
    expect(fake.functions.invoke).toHaveBeenCalledWith('export-account', {
      headers: { Authorization: 'Bearer access-token' },
      method: 'POST',
    });
  });

  it('maps export function failures without exposing provider text', async () => {
    const fake = createClientDouble();
    fake.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'database secret from function' },
    } as never);

    const result = createSupabaseAccountService(fake.client).exportData();

    await expect(result).rejects.toEqual(
      new AccountError('export_failed', 'Kin could not export your data. Try again.'),
    );
    await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('secret'));
  });

  it('signs out locally only after confirmed server deletion', async () => {
    const fake = createClientDouble();

    await expect(createSupabaseAccountService(fake.client).deleteAccount())
      .resolves.toEqual({ deleted: true });
    expect(fake.events).toEqual(['delete-account', 'sign-out']);
  });

  it('attempts notification installation cleanup before deleting the account', async () => {
    const fake = createClientDouble();
    const beforeDelete = jest.fn(async () => {
      fake.events.push('deactivate-installation');
      throw new Error('offline');
    });

    await expect(createSupabaseAccountService(fake.client, { beforeDelete }).deleteAccount())
      .resolves.toEqual({ deleted: true });
    expect(fake.events).toEqual(['deactivate-installation', 'delete-account', 'sign-out']);
  });

  it('does not sign out when deletion is not confirmed', async () => {
    const fake = createClientDouble();
    fake.functions.invoke.mockResolvedValueOnce({ data: { deleted: false }, error: null } as never);

    await expect(createSupabaseAccountService(fake.client).deleteAccount()).rejects.toMatchObject({
      code: 'deletion_failed',
      message: 'Kin could not delete your account. Try again.',
    });
    expect(fake.auth.signOut).not.toHaveBeenCalled();
  });

  it('requires a restored session before privileged operations', async () => {
    const fake = createClientDouble();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null } as never);

    await expect(createSupabaseAccountService(fake.client).exportData()).rejects.toMatchObject({
      code: 'reauth_required',
      message: 'Sign in again before continuing.',
    });
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });
});
