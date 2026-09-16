import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { AuthContext, type AuthContextValue } from '@/state/AuthProvider';
import { AccountError, type AccountExport } from '@/services/account/contracts';
import { createDemoAccountService } from '@/services/account/demo';
import { AccountActions } from '../AccountActions';

async function renderAccountActions({
  mode = 'connected',
  onResetDemo = jest.fn(async () => undefined),
  onSignedOut = jest.fn(),
  onDelete,
  onExport,
  onPresentExport,
  onRequestFreshOtp,
  onVerifyFreshOtp,
  signOut = jest.fn(async () => undefined),
}: {
  mode?: 'connected' | 'demo';
  onResetDemo?: () => Promise<void>;
  onSignedOut?: () => void;
  onDelete?: () => Promise<{ deleted: true }>;
  onExport?: () => Promise<AccountExport>;
  onPresentExport?: (data: AccountExport) => Promise<void>;
  onRequestFreshOtp?: (email: string) => Promise<void>;
  onVerifyFreshOtp?: (email: string, token: string) => Promise<void>;
  signOut?: () => Promise<void>;
} = {}) {
  const auth: AuthContextValue = {
    accountService: createDemoAccountService(),
    requestOtp: async () => undefined,
    signOut,
    state: mode === 'demo'
      ? { status: 'demo' }
      : { status: 'signed-in', user: { id: 'user-1', email: 'maya@example.com' } },
    verifyOtp: async (email) => ({ id: 'user-1', email }),
  };
  await render(
    <AuthContext.Provider value={auth}>
      <AccountActions
        accountEmail={mode === 'connected' ? 'maya@example.com' : undefined}
        mode={mode}
        onDelete={onDelete}
        onExport={onExport}
        onPresentExport={onPresentExport}
        onRequestFreshOtp={onRequestFreshOtp}
        onResetDemo={onResetDemo}
        onSignedOut={onSignedOut}
        onVerifyFreshOtp={onVerifyFreshOtp}
      />
    </AuthContext.Provider>,
  );
  return { onResetDemo, onSignedOut, signOut };
}

describe('AccountActions', () => {
  it('opens sign-out confirmation and lets the user cancel', async () => {
    const { signOut } = await renderAccountActions();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign out now' })).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Keep me signed in' }));

    expect(screen.queryByRole('button', { name: 'Sign out now' })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('waits for connected sign-out before returning home', async () => {
    let finishSignOut: (() => void) | undefined;
    const signOut = jest.fn(() => new Promise<void>((resolve) => {
      finishSignOut = resolve;
    }));
    const onSignedOut = jest.fn();
    await renderAccountActions({ onSignedOut, signOut });
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sign out' }));

    await user.press(screen.getByRole('button', { name: 'Sign out now' }));
    expect(onSignedOut).not.toHaveBeenCalled();
    await act(async () => finishSignOut?.());

    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it('keeps confirmation open with safe copy when sign-out fails', async () => {
    const signOut = jest.fn(async () => {
      throw new Error('provider secret');
    });
    const onSignedOut = jest.fn();
    await renderAccountActions({ onSignedOut, signOut });
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sign out' }));

    await user.press(screen.getByRole('button', { name: 'Sign out now' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Kin could not sign you out. Try again.');
    expect(screen.getByRole('button', { name: 'Sign out now' })).toBeTruthy();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('labels and runs the explicit demo reset separately', async () => {
    const onResetDemo = jest.fn(async () => undefined);
    const onSignedOut = jest.fn();
    const { signOut } = await renderAccountActions({ mode: 'demo', onResetDemo, onSignedOut });
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Reset demo' }));

    await user.press(screen.getByRole('button', { name: 'Reset demo now' }));

    expect(onResetDemo).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('exports data and presents the resulting file or share payload', async () => {
    const exported: AccountExport = {
      exportedAt: '2026-09-16T00:00:00.000Z',
      profile: { displayName: 'Maya' },
      version: 1,
    };
    const onExport = jest.fn(async () => exported);
    const onPresentExport = jest.fn(async () => undefined);
    await renderAccountActions({ onExport, onPresentExport });
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Export my data' }));

    await waitFor(() => expect(onPresentExport).toHaveBeenCalledWith(exported));
    expect(screen.getByText('Your Kin export is ready.')).toBeTruthy();
  });

  it('requires a fresh code and exact deletion confirmation before deleting', async () => {
    const onRequestFreshOtp = jest.fn(async () => undefined);
    const onVerifyFreshOtp = jest.fn(async () => undefined);
    const onDelete = jest.fn(async () => ({ deleted: true as const }));
    const onSignedOut = jest.fn();
    await renderAccountActions({
      onDelete,
      onRequestFreshOtp,
      onSignedOut,
      onVerifyFreshOtp,
    });
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('header', { name: 'Delete your account?' })).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Email a deletion code' }));
    expect(onRequestFreshOtp).toHaveBeenCalledWith('maya@example.com');

    await user.type(screen.getByLabelText('Deletion code'), '123456');
    await user.press(screen.getByRole('button', { name: 'Verify deletion code' }));
    expect(onVerifyFreshOtp).toHaveBeenCalledWith('maya@example.com', '123456');

    await user.type(screen.getByLabelText('Type DELETE to confirm account deletion'), 'DELETE');
    await user.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('preserves deletion confirmation after a recoverable server failure', async () => {
    const onDelete = jest.fn(async () => {
      throw new AccountError('deletion_failed', 'Kin could not delete your account. Try again.');
    });
    await renderAccountActions({
      onDelete,
      onRequestFreshOtp: async () => undefined,
      onVerifyFreshOtp: async () => undefined,
    });
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete account' }));
    await user.press(screen.getByRole('button', { name: 'Email a deletion code' }));
    await user.type(screen.getByLabelText('Deletion code'), '123456');
    await user.press(screen.getByRole('button', { name: 'Verify deletion code' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm account deletion'), 'DELETE');

    await user.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Kin could not delete your account. Try again.');
    expect(screen.getByLabelText('Type DELETE to confirm account deletion'))
      .toHaveProp('value', 'DELETE');
  });
});
