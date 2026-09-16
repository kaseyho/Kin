import { act, render, screen, userEvent } from '@testing-library/react-native';

import { AuthContext, type AuthContextValue } from '@/state/AuthProvider';
import { AuthError } from '@/services/auth/contracts';
import { AuthScreen } from '../AuthScreen';

async function renderAuthScreen({
  onSignedIn = jest.fn(),
  requestOtp = jest.fn(async () => undefined),
  verifyOtp = jest.fn(async () => ({ id: 'user-1', email: 'maya@example.com' })),
}: {
  onSignedIn?: () => void;
  requestOtp?: AuthContextValue['requestOtp'];
  verifyOtp?: AuthContextValue['verifyOtp'];
} = {}) {
  const value: AuthContextValue = {
    requestOtp,
    signOut: async () => undefined,
    state: { status: 'signed-out' },
    verifyOtp,
  };
  return {
    onSignedIn,
    requestOtp,
    verifyOtp,
    view: await render(
      <AuthContext.Provider value={value}>
        <AuthScreen onSignedIn={onSignedIn} />
      </AuthContext.Provider>,
    ),
  };
}

async function requestCode(
  user: ReturnType<typeof userEvent.setup>,
  email = '  Maya@Example.com ',
) {
  await user.type(screen.getByLabelText('Email address'), email);
  await user.press(screen.getByRole('button', { name: 'Email me a code' }));
  expect(screen.getByRole('header', { name: 'Check your email' })).toBeTruthy();
}

describe('AuthScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects invalid email without leaving the email step', async () => {
    const { requestOtp } = await renderAuthScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'not-an-email');

    await user.press(screen.getByRole('button', { name: 'Email me a code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(screen.getByRole('header', { name: 'Welcome to Kin' })).toBeTruthy();
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it('normalizes a valid email and opens the code step', async () => {
    const { requestOtp } = await renderAuthScreen();
    const user = userEvent.setup();

    await requestCode(user);

    expect(screen.getByText('maya@example.com')).toBeTruthy();
    expect(requestOtp).toHaveBeenCalledWith('maya@example.com');
  });

  it('rejects a code that is not six digits', async () => {
    const { verifyOtp } = await renderAuthScreen();
    const user = userEvent.setup();
    await requestCode(user);
    await user.type(screen.getByLabelText('Six-digit code'), '12345');

    await user.press(screen.getByRole('button', { name: 'Continue to Kin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the six-digit code.');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies a valid code and announces sign-in', async () => {
    const onSignedIn = jest.fn();
    const { verifyOtp } = await renderAuthScreen({ onSignedIn });
    const user = userEvent.setup();
    await requestCode(user, 'maya@example.com');
    await user.type(screen.getByLabelText('Six-digit code'), '123456');

    await user.press(screen.getByRole('button', { name: 'Continue to Kin' }));
    expect(verifyOtp).toHaveBeenCalledWith('maya@example.com', '123456');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('shows stable rate-limit guidance from the auth boundary', async () => {
    const requestOtp = jest.fn(async () => {
      throw new AuthError(
        'rate_limited',
        'Too many codes were requested. Wait a moment and try again.',
      );
    });
    await renderAuthScreen({ requestOtp });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'maya@example.com');

    await user.press(screen.getByRole('button', { name: 'Email me a code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many codes were requested. Wait a moment and try again.',
    );
  });

  it('returns to email editing without discarding the address', async () => {
    await renderAuthScreen();
    const user = userEvent.setup();
    await requestCode(user, 'maya@example.com');

    await user.press(screen.getByRole('button', { name: 'Use a different email' }));

    expect(screen.getByRole('header', { name: 'Welcome to Kin' })).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toHaveProp('value', 'maya@example.com');
  });

  it('enables resend after thirty seconds and requests a fresh code', async () => {
    jest.useFakeTimers();
    const { requestOtp } = await renderAuthScreen();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await requestCode(user, 'maya@example.com');

    expect(screen.getByRole('button', { name: 'Resend in 30s' })).toBeDisabled();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await user.press(screen.getByRole('button', { name: 'Resend code' }));

    expect(requestOtp).toHaveBeenCalledTimes(2);
  });
});
