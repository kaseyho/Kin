import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { AuthService, AuthState, AuthUser } from '@/services/auth/contracts';
import type { AccountService } from '@/services/account/contracts';
import { AuthProvider } from '../AuthProvider';
import { useAuth } from '../useAuth';

class FakeAuthService implements AuthService {
  private readonly listeners = new Set<(state: AuthState) => void>();
  private rejectLoad: ((error: Error) => void) | null = null;
  private resolveLoad: ((state: AuthState) => void) | null = null;

  load(): Promise<AuthState> {
    return new Promise((resolve, reject) => {
      this.resolveLoad = resolve;
      this.rejectLoad = reject;
    });
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async requestOtp(email: string): Promise<void> {
    if (email !== 'maya@example.com') throw new Error('wrong email');
  }

  async verifyOtp(email: string, token: string): Promise<AuthUser> {
    if (email !== 'maya@example.com' || token !== '123456') throw new Error('wrong OTP');
    return { email, id: 'user-1' };
  }

  async signOut(): Promise<void> {
    this.emit({ status: 'signed-out' });
  }

  finishLoading(state: AuthState) {
    this.resolveLoad?.(state);
  }

  failLoading(error: Error) {
    this.rejectLoad?.(error);
  }

  emit(state: AuthState) {
    for (const listener of this.listeners) listener(state);
  }

  get listenerCount() {
    return this.listeners.size;
  }
}

const accountService = {
  deleteAccount: async () => ({ deleted: true as const }),
  exportData: async () => ({
    exportedAt: '2026-09-16T00:00:00.000Z',
    profile: null,
    version: 1 as const,
  }),
  requestFreshOtp: async () => undefined,
  verifyFreshOtp: async () => undefined,
} satisfies AccountService;

function Probe() {
  const auth = useAuth();
  const [outcome, setOutcome] = useState('');
  const label = auth.state.status === 'signed-in'
    ? `${auth.state.status}:${auth.state.user.email}`
    : auth.state.status;

  return (
    <>
      <Text>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          await auth.requestOtp('maya@example.com');
        }}
      >
        <Text>Request code</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          const user = await auth.verifyOtp('maya@example.com', '123456');
          setOutcome(user.id);
        }}
      >
        <Text>Verify code</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => auth.signOut()}>
        <Text>Sign out</Text>
      </Pressable>
      {outcome ? <Text>{outcome}</Text> : null}
    </>
  );
}

function AccountProbe() {
  const auth = useAuth();
  return <Text>{auth.accountService === accountService ? 'account-ready' : 'account-missing'}</Text>;
}

describe('AuthProvider', () => {
  it('shows loading until session restoration resolves', async () => {
    const service = new FakeAuthService();
    await render(
      <AuthProvider accountService={accountService} service={service}>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText('loading')).toBeTruthy();
    await act(async () => service.finishLoading({ status: 'signed-out' }));
    expect(screen.getByText('signed-out')).toBeTruthy();
  });

  it('keeps a newer auth event when a stale load finishes later', async () => {
    const service = new FakeAuthService();
    await render(
      <AuthProvider accountService={accountService} service={service}>
        <Probe />
      </AuthProvider>,
    );

    await act(async () => {
      service.emit({
        status: 'signed-in',
        user: { id: 'user-1', email: 'maya@example.com' },
      });
    });
    await act(async () => service.finishLoading({ status: 'signed-out' }));

    expect(screen.getByText('signed-in:maya@example.com')).toBeTruthy();
  });

  it('fails closed when session restoration is unavailable', async () => {
    const service = new FakeAuthService();
    await render(
      <AuthProvider accountService={accountService} service={service}>
        <Probe />
      </AuthProvider>,
    );

    await act(async () => service.failLoading(new Error('offline')));

    expect(screen.getByText('signed-out')).toBeTruthy();
  });

  it('exposes auth actions and their consumer-visible results', async () => {
    const service = new FakeAuthService();
    await render(
      <AuthProvider accountService={accountService} service={service}>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => service.finishLoading({ status: 'signed-out' }));

    await act(async () => fireEvent.press(screen.getByText('Request code')));
    await act(async () => fireEvent.press(screen.getByText('Verify code')));
    expect(screen.getByText('user-1')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByText('Sign out')));
    expect(screen.getByText('signed-out')).toBeTruthy();
  });

  it('removes its auth listener on unmount', async () => {
    const service = new FakeAuthService();
    const view = await render(
      <AuthProvider accountService={accountService} service={service}>
        <Probe />
      </AuthProvider>,
    );
    expect(service.listenerCount).toBe(1);

    await view.unmount();

    expect(service.listenerCount).toBe(0);
  });

  it('exposes account lifecycle operations beside the session', async () => {
    const service = new FakeAuthService();
    await render(
      <AuthProvider accountService={accountService} service={service}>
        <AccountProbe />
      </AuthProvider>,
    );

    expect(screen.getByText('account-ready')).toBeTruthy();
  });
});
