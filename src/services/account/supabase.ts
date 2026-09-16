import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountError, type AccountExport, type AccountService } from './contracts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AccountError('reauth_required', 'Enter the email address for this Kin account.');
  }
  return normalized;
}

function requireOtp(token: string): string {
  if (!OTP_PATTERN.test(token)) {
    throw new AccountError('reauth_required', 'Enter the six-digit code from your email.');
  }
  return token;
}

export function createSupabaseAccountService(client: SupabaseClient): AccountService {
  async function accessToken(): Promise<string> {
    const result = await client.auth.getSession();
    if (result.error || !result.data.session?.access_token) {
      throw new AccountError('reauth_required', 'Sign in again before continuing.');
    }
    return result.data.session.access_token;
  }

  return {
    async requestFreshOtp(email) {
      const result = await client.auth.signInWithOtp({
        email: requireEmail(email),
        options: { shouldCreateUser: false },
      });
      if (result.error) {
        throw new AccountError('reauth_required', 'Kin could not send a fresh code. Try again.');
      }
    },

    async verifyFreshOtp(email, token) {
      const result = await client.auth.verifyOtp({
        email: requireEmail(email),
        token: requireOtp(token),
        type: 'email',
      });
      if (result.error || !result.data.session) {
        throw new AccountError('reauth_required', 'That code could not be verified. Request a new one.');
      }
    },

    async exportData() {
      const token = await accessToken();
      const result = await client.functions.invoke<AccountExport>('export-account', {
        headers: { Authorization: `Bearer ${token}` },
        method: 'POST',
      });
      if (result.error || !result.data || result.data.version !== 1) {
        throw new AccountError('export_failed', 'Kin could not export your data. Try again.');
      }
      return result.data;
    },

    async deleteAccount() {
      const token = await accessToken();
      const result = await client.functions.invoke<{ deleted?: boolean }>('delete-account', {
        headers: { Authorization: `Bearer ${token}` },
        method: 'POST',
      });
      if (result.error || result.data?.deleted !== true) {
        throw new AccountError('deletion_failed', 'Kin could not delete your account. Try again.');
      }
      const signOut = await client.auth.signOut();
      if (signOut.error) {
        throw new AccountError(
          'unavailable',
          'Your account was deleted, but Kin could not clear this device. Close and reopen the app.',
        );
      }
      return { deleted: true };
    },
  };
}
