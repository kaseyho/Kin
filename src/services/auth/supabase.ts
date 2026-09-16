import type { SupabaseClient } from '@supabase/supabase-js';

import { AuthError, type AuthErrorCode, type AuthService, type AuthState, type AuthUser } from './contracts';

export type SupabaseAuthPort = Pick<
  SupabaseClient['auth'],
  'getSession' | 'onAuthStateChange' | 'signInWithOtp' | 'signOut' | 'verifyOtp'
>;

interface SupabaseAuthClient {
  auth: SupabaseAuthPort;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AuthError('invalid_email', 'Enter a valid email address.');
  }
  return normalized;
}

function requireOtp(token: string): string {
  if (!OTP_PATTERN.test(token)) {
    throw new AuthError('invalid_otp', 'Enter the six-digit code from your email.');
  }
  return token;
}

function toAuthUser(user: { id: string; email?: string | null } | null): AuthUser | null {
  if (!user?.email) return null;
  return { id: user.id, email: normalizeEmail(user.email) };
}

function toAuthState(session: { user: { id: string; email?: string | null } } | null): AuthState {
  const user = toAuthUser(session?.user ?? null);
  return user ? { status: 'signed-in', user } : { status: 'signed-out' };
}

function providerMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return '';
  const message = error.message;
  return typeof message === 'string' ? message.toLowerCase() : '';
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

function mapProviderError(error: unknown, fallback: string): AuthError {
  const message = providerMessage(error);
  const status = providerStatus(error);

  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return new AuthError('rate_limited', 'Too many codes were requested. Wait a moment and try again.');
  }
  if (message.includes('expired')) {
    return new AuthError('expired_otp', 'That code has expired. Request a new one and try again.');
  }
  if (message.includes('token') || message.includes('otp') || message.includes('code')) {
    return new AuthError('invalid_otp', 'That code is not valid. Check the email and try again.');
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('offline')) {
    return new AuthError('offline', 'Kin could not connect. Check your internet connection and try again.');
  }
  return new AuthError('unavailable', fallback);
}

export function createSupabaseAuthService(client: SupabaseAuthClient): AuthService {
  return {
    async load() {
      const result = await client.auth.getSession();
      if (result.error) {
        throw mapProviderError(result.error, 'Kin could not restore your session. Try again.');
      }
      return toAuthState(result.data.session);
    },

    subscribe(listener) {
      const result = client.auth.onAuthStateChange((_event, session) => {
        listener(toAuthState(session));
      });
      return () => result.data.subscription.unsubscribe();
    },

    async requestOtp(email) {
      const normalizedEmail = requireEmail(email);
      const result = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (result.error) {
        throw mapProviderError(result.error, 'Kin could not send a sign-in code. Try again.');
      }
    },

    async verifyOtp(email, token) {
      const normalizedEmail = requireEmail(email);
      const normalizedToken = requireOtp(token);
      const result = await client.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: 'email',
      });
      if (result.error) {
        throw mapProviderError(result.error, 'Kin could not verify that code. Try again.');
      }
      const user = toAuthUser(result.data.user);
      if (!user) {
        throw new AuthError('unavailable', 'Kin could not finish signing you in. Try again.');
      }
      return user;
    },

    async signOut() {
      const result = await client.auth.signOut();
      if (result.error) {
        throw mapProviderError(result.error, 'Kin could not sign you out. Try again.');
      }
    },
  };
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function getAuthErrorCode(error: unknown): AuthErrorCode | null {
  return isAuthError(error) ? error.code : null;
}
