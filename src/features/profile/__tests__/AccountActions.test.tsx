import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { AuthContext, type AuthContextValue } from '@/state/AuthProvider';
import { AccountActions } from '../AccountActions';

async function renderAccountActions({
  mode = 'connected',
  onResetDemo = jest.fn(async () => undefined),
  onSignedOut = jest.fn(),
  signOut = jest.fn(async () => undefined),
}: {
  mode?: 'connected' | 'demo';
  onResetDemo?: () => Promise<void>;
  onSignedOut?: () => void;
  signOut?: () => Promise<void>;
} = {}) {
  const auth: AuthContextValue = {
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
        mode={mode}
        onResetDemo={onResetDemo}
        onSignedOut={onSignedOut}
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
});
