import { createDemoAuthService } from '../demo';
import { AuthError } from '../contracts';
import { createSupabaseAuthService, type SupabaseAuthPort } from '../supabase';

type PortUser = { id: string; email?: string | null };
type PortSession = { user: PortUser };
type PortError = { message: string; status?: number; code?: string } | null;

function createAuthDouble({
  session = null,
  user = { id: 'user-1', email: 'maya@example.com' },
}: {
  session?: PortSession | null;
  user?: PortUser | null;
} = {}) {
  let authListener: ((event: string, nextSession: PortSession | null) => void) | undefined;
  const unsubscribe = jest.fn();
  const auth = {
    getSession: jest.fn(async () => ({ data: { session }, error: null as PortError })),
    onAuthStateChange: jest.fn((listener: (event: string, nextSession: PortSession | null) => void) => {
      authListener = listener;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithOtp: jest.fn(async () => ({ error: null as PortError })),
    verifyOtp: jest.fn(async () => ({ data: { user }, error: null as PortError })),
    signOut: jest.fn(async () => ({ error: null as PortError })),
  };

  return {
    auth,
    client: { auth: auth as unknown as SupabaseAuthPort },
    emit(session: PortSession | null) {
      authListener?.('SIGNED_IN', session);
    },
    unsubscribe,
  };
}

describe('createSupabaseAuthService', () => {
  it('restores a signed-in session', async () => {
    const fake = createAuthDouble({
      session: { user: { id: 'user-1', email: 'maya@example.com' } },
    });

    await expect(createSupabaseAuthService(fake.client).load()).resolves.toEqual({
      status: 'signed-in',
      user: { id: 'user-1', email: 'maya@example.com' },
    });
  });

  it('restores a missing session as signed out', async () => {
    const fake = createAuthDouble();

    await expect(createSupabaseAuthService(fake.client).load()).resolves.toEqual({
      status: 'signed-out',
    });
  });

  it('normalizes email before requesting an OTP', async () => {
    const fake = createAuthDouble();
    const service = createSupabaseAuthService(fake.client);

    await service.requestOtp('  Maya@Example.com ');

    expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'maya@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('rejects an invalid email before calling the provider', async () => {
    const fake = createAuthDouble();
    const service = createSupabaseAuthService(fake.client);

    await expect(service.requestOtp('not-an-email')).rejects.toMatchObject({
      code: 'invalid_email',
    });
    expect(fake.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('verifies a six-digit email OTP and returns the user', async () => {
    const fake = createAuthDouble();
    const service = createSupabaseAuthService(fake.client);

    await expect(service.verifyOtp('Maya@Example.com', '123456')).resolves.toEqual({
      id: 'user-1',
      email: 'maya@example.com',
    });
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'maya@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('rejects invalid OTP input before calling the provider', async () => {
    const fake = createAuthDouble();
    const service = createSupabaseAuthService(fake.client);

    await expect(service.verifyOtp('maya@example.com', '12 456')).rejects.toMatchObject({
      code: 'invalid_otp',
    });
    expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('maps provider throttling to stable Kin copy', async () => {
    const fake = createAuthDouble();
    fake.auth.signInWithOtp.mockResolvedValueOnce({
      error: { message: 'provider rate limit details', status: 429 },
    });

    await expect(createSupabaseAuthService(fake.client).requestOtp('maya@example.com')).rejects.toEqual(
      new AuthError('rate_limited', 'Too many codes were requested. Wait a moment and try again.'),
    );
  });

  it('maps an expired provider token without exposing provider text', async () => {
    const fake = createAuthDouble();
    fake.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Token has expired and secret diagnostics follow' },
    });

    const result = createSupabaseAuthService(fake.client).verifyOtp('maya@example.com', '123456');

    await expect(result).rejects.toMatchObject({
      code: 'expired_otp',
      message: 'That code has expired. Request a new one and try again.',
    });
    await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('secret'));
  });

  it('maps sign-out failures without exposing provider text', async () => {
    const fake = createAuthDouble();
    fake.auth.signOut.mockResolvedValueOnce({
      error: { message: 'provider database secret' },
    });

    const result = createSupabaseAuthService(fake.client).signOut();

    await expect(result).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Kin could not sign you out. Try again.',
    });
    await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('secret'));
  });

  it('publishes auth changes and safely unsubscribes', () => {
    const fake = createAuthDouble();
    const listener = jest.fn();

    const unsubscribe = createSupabaseAuthService(fake.client).subscribe(listener);
    fake.emit({ user: { id: 'user-2', email: 'sam@example.com' } });
    fake.emit(null);
    unsubscribe();

    expect(listener).toHaveBeenNthCalledWith(1, {
      status: 'signed-in',
      user: { id: 'user-2', email: 'sam@example.com' },
    });
    expect(listener).toHaveBeenNthCalledWith(2, { status: 'signed-out' });
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('createDemoAuthService', () => {
  it('loads an explicit demo state and rejects connected-only actions', async () => {
    const service = createDemoAuthService();

    await expect(service.load()).resolves.toEqual({ status: 'demo' });
    await expect(service.requestOtp('maya@example.com')).rejects.toMatchObject({
      code: 'unavailable',
      message: 'This action is unavailable in the Kin demo.',
    });
  });
});
