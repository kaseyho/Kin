import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { AuthState } from '@/services/auth/contracts';
import { BillingError, type PremiumService } from '@/services/billing/contracts';
import type { EntitlementState, KinPlusOffering } from '@/domain/models';
import { PremiumProvider } from '../PremiumProvider';
import { usePremiumGate } from '../usePremiumGate';

function deferred<T>() {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function service(overrides: Partial<PremiumService> = {}): PremiumService {
  const inactive = { isKinPlus: false, source: 'revenuecat' as const };
  return {
    activateUser: async () => inactive,
    deactivateUser: async () => undefined,
    getEntitlement: async () => inactive,
    getOffering: async () => null,
    manageSubscription: async () => undefined,
    purchase: async () => inactive,
    restore: async () => inactive,
    subscribe: () => () => undefined,
    ...overrides,
  };
}

function Probe() {
  const premium = usePremiumGate();
  return (
    <>
      <Text testID="session">{premium.sessionStatus}</Text>
      <Text testID="entitlement">{premium.entitlement.isKinPlus ? 'plus' : 'free'}</Text>
      <Text testID="entitlement-loading">{String(premium.entitlementLoading)}</Text>
      <Text testID="offering-loading">{String(premium.offeringLoading)}</Text>
      <Text testID="identity-error">{premium.identityError}</Text>
      <Text testID="offering-error">{premium.offeringError}</Text>
      <Text testID="offering">{premium.offering?.id ?? 'none'}</Text>
      <Pressable accessibilityRole="button" onPress={() => void premium.retryOffering()}>
        <Text>Retry offering probe</Text>
      </Pressable>
    </>
  );
}

function view(
  billing: PremiumService,
  authState: AuthState,
) {
  return (
    <PremiumProvider authState={authState} deployment="development" service={billing}>
      <Probe />
    </PremiumProvider>
  );
}

it('waits for restored auth and ignores a stale activation after an account switch', async () => {
  const userA = deferred<EntitlementState>();
  const userB = deferred<EntitlementState>();
  const activateUser = jest.fn((userId: string) => userId === 'user-a' ? userA.promise : userB.promise);
  const billing = service({ activateUser });
  const result = await render(view(billing, { status: 'loading' }));

  expect(activateUser).not.toHaveBeenCalled();
  expect(screen.getByTestId('session')).toHaveTextContent('waiting');

  await result.rerender(view(billing, {
    status: 'signed-in',
    user: { email: 'a@example.com', id: 'user-a' },
  }));
  expect(activateUser).toHaveBeenCalledWith('user-a');

  await result.rerender(view(billing, {
    status: 'signed-in',
    user: { email: 'b@example.com', id: 'user-b' },
  }));
  expect(screen.getByTestId('entitlement')).toHaveTextContent('free');
  expect(activateUser).toHaveBeenCalledWith('user-b');

  await act(async () => userA.resolve({ isKinPlus: true, source: 'revenuecat' }));
  expect(screen.getByTestId('entitlement')).toHaveTextContent('free');

  await act(async () => userB.resolve({ isKinPlus: false, source: 'revenuecat' }));
  await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('active'));
  expect(screen.getByTestId('entitlement')).toHaveTextContent('free');
});

it('clears entitlement synchronously on sign-out before provider cleanup finishes', async () => {
  const cleanup = deferred<void>();
  const deactivateUser = jest.fn(() => cleanup.promise);
  const billing = service({
    activateUser: async () => ({ isKinPlus: true, source: 'revenuecat' }),
    deactivateUser,
  });
  const result = await render(view(billing, {
    status: 'signed-in',
    user: { email: 'a@example.com', id: 'user-a' },
  }));
  await waitFor(() => expect(screen.getByTestId('entitlement')).toHaveTextContent('plus'));

  await result.rerender(view(billing, { status: 'signed-out' }));

  expect(screen.getByTestId('session')).toHaveTextContent('inactive');
  expect(screen.getByTestId('entitlement')).toHaveTextContent('free');
  expect(deactivateUser).toHaveBeenCalledTimes(1);
  await act(async () => cleanup.resolve());
});

it('keeps an active entitlement when offering load fails and retries only the offering', async () => {
  const offering: KinPlusOffering = { id: 'default', packages: [] };
  const getOffering = jest
    .fn<Promise<KinPlusOffering | null>, []>()
    .mockRejectedValueOnce(new BillingError('offering_failed', 'Kin could not load purchase options.'))
    .mockResolvedValueOnce(offering);
  const billing = service({
    activateUser: async () => ({ isKinPlus: true, source: 'revenuecat' }),
    getOffering,
  });
  await render(view(billing, {
    status: 'signed-in',
    user: { email: 'a@example.com', id: 'user-a' },
  }));

  await waitFor(() => expect(screen.getByTestId('offering-error')).toHaveTextContent(/load purchase options/i));
  expect(screen.getByTestId('entitlement')).toHaveTextContent('plus');

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Retry offering probe' }));
  });
  await waitFor(() => expect(screen.getByTestId('offering')).toHaveTextContent('default'));
  expect(getOffering).toHaveBeenCalledTimes(2);
});
