export interface AuthUser {
  id: string;
  email: string;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'demo' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: AuthUser };

export type AuthErrorCode =
  | 'invalid_email'
  | 'invalid_otp'
  | 'expired_otp'
  | 'rate_limited'
  | 'offline'
  | 'unavailable';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthService {
  load(): Promise<AuthState>;
  subscribe(listener: (state: AuthState) => void): () => void;
  requestOtp(email: string): Promise<void>;
  verifyOtp(email: string, token: string): Promise<AuthUser>;
  signOut(): Promise<void>;
}
