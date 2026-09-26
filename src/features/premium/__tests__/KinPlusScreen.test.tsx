import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { AuthState } from '@/services/auth/contracts';
import type { PremiumService } from '@/services/billing/contracts';
import { BillingError } from '@/services/billing/contracts';
import { createDemoPremiumService } from '@/services/billing/demo';
import { KinPlusScreen } from '../KinPlusScreen';
import { PremiumProvider } from '../PremiumProvider';

async function renderPremium(
  service: PremiumService,
  authState: AuthState = {
    status: 'signed-in',
    user: { email: 'maya@example.com', id: 'user-1' },
  },
) {
  return render(
    <PremiumProvider authState={authState} deployment={authState.status === 'demo' ? 'demo' : 'development'} service={service}>
      <KinPlusScreen onClose={jest.fn()} />
    </PremiumProvider>,
  );
}

describe('KinPlusScreen', () => {
  it('unlocks the labeled demo entitlement', async () => {
    const user = userEvent.setup();
    await renderPremium(createDemoPremiumService(false), { status: 'demo' });

    expect(await screen.findByText('Relationship themes')).toBeTruthy();
    expect(screen.getByText('Unlimited Moments')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Try Kin+ in demo' }));
    expect(await screen.findByRole('header', { name: 'Kin+ is active' })).toBeTruthy();
    expect(screen.getByText(/Demo entitlement/)).toBeTruthy();
  });

  it('keeps Restore available while offerings load and locks conflicting transactions', async () => {
    let resolveOffering!: (value: Awaited<ReturnType<PremiumService['getOffering']>>) => void;
    const offering = new Promise<Awaited<ReturnType<PremiumService['getOffering']>>>((resolve) => {
      resolveOffering = resolve;
    });
    let resolvePurchase!: (value: Awaited<ReturnType<PremiumService['purchase']>>) => void;
    const pendingPurchase = new Promise<Awaited<ReturnType<PremiumService['purchase']>>>((resolve) => {
      resolvePurchase = resolve;
    });
    const purchase = jest.fn(() => pendingPurchase);
    const restore = jest.fn(async () => ({ isKinPlus: false, source: 'revenuecat' as const }));
    const service: PremiumService = {
      activateUser: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      deactivateUser: async () => undefined,
      getEntitlement: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      getOffering: async () => offering,
      manageSubscription: async () => undefined,
      purchase,
      restore,
      subscribe: () => () => undefined,
    };
    await renderPremium(service);

    expect(await screen.findByRole('button', { name: 'Restore purchases' })).toBeTruthy();
    expect(screen.getByText('Loading purchase options…')).toBeTruthy();
    await act(async () => resolveOffering({
      id: 'default',
      packages: [{
        billingPeriodLabel: 'per month',
        id: 'monthly',
        priceLabel: '$3.99',
        title: 'Monthly',
        trialLabel: '7-day free trial',
      }],
    }));
    const buy = await screen.findByRole('button', { name: 'Choose Monthly, $3.99, per month, 7-day free trial' });

    await fireEvent.press(buy);
    await fireEvent.press(buy);

    try {
      expect(purchase).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(
        screen.getByRole('button', { name: 'Choose Monthly, $3.99, per month, 7-day free trial' }),
      ).toHaveProp('accessibilityState', { busy: true, disabled: true }));
      expect(screen.getByRole('button', { name: 'Restore purchases' }))
        .toHaveProp('accessibilityState', { busy: false, disabled: true });
    } finally {
      await act(async () => resolvePurchase({ isKinPlus: true, source: 'revenuecat' }));
      await waitFor(() => expect(screen.getByRole('header', { name: 'Kin+ is active' })).toBeTruthy());
    }
  });

  it('shows provider-derived terms, neutral expiration, and recoverable management failure', async () => {
    const manageSubscription = jest.fn()
      .mockRejectedValueOnce(new BillingError('management_failed', 'Kin could not open subscription management.'))
      .mockResolvedValueOnce(undefined);
    const service: PremiumService = {
      activateUser: async () => ({
        canManageSubscription: true,
        expiresAt: '2027-09-26T00:00:00.000Z',
        isKinPlus: true,
        source: 'revenuecat',
      }),
      deactivateUser: async () => undefined,
      getEntitlement: async () => ({ isKinPlus: true, source: 'revenuecat' }),
      getOffering: async () => null,
      manageSubscription,
      purchase: async () => ({ isKinPlus: true, source: 'revenuecat' }),
      restore: async () => ({ isKinPlus: true, source: 'revenuecat' }),
      subscribe: () => () => undefined,
    };
    const user = userEvent.setup();
    await renderPremium(service);

    expect(await screen.findByText('Access through Sep 26, 2027.')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Manage subscription' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open subscription management/i);
    await user.press(screen.getByRole('button', { name: 'Retry subscription management' }));
    await waitFor(() => expect(manageSubscription).toHaveBeenCalledTimes(2));
  });

  it('explains unavailable browser billing without hiding Restore', async () => {
    const service: PremiumService = {
      activateUser: async () => ({ isKinPlus: false, source: 'unavailable' }),
      deactivateUser: async () => undefined,
      getEntitlement: async () => ({ isKinPlus: false, source: 'unavailable' }),
      subscribe: () => () => undefined,
      getOffering: async () => null,
      manageSubscription: async () => undefined,
      purchase: async () => { throw new BillingError('unavailable', 'Billing unavailable'); },
      restore: async () => ({ isKinPlus: false, source: 'unavailable' }),
    };
    await renderPremium(service);

    expect(await screen.findByText('No Kin+ offering is available for this build')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy();
  });

  it('treats cancellation quietly, offers Retry after failure, and reports an empty restore', async () => {
    let attempts = 0;
    const service: PremiumService = {
      activateUser: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      deactivateUser: async () => undefined,
      getEntitlement: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      subscribe: () => () => undefined,
      getOffering: async () => ({
        id: 'default',
        packages: [{ id: 'monthly', title: 'Monthly', priceLabel: '$3.99' }],
      }),
      manageSubscription: async () => undefined,
      purchase: async () => {
        attempts += 1;
        throw new BillingError(attempts === 1 ? 'cancelled' : 'purchase_failed', 'Could not finish purchase');
      },
      restore: async () => ({ isKinPlus: false, source: 'revenuecat' }),
    };
    const user = userEvent.setup();
    await renderPremium(service);
    const buy = await screen.findByRole('button', { name: 'Choose Monthly, $3.99' });

    await user.press(buy);
    expect(screen.queryByRole('alert')).toBeNull();
    await user.press(buy);
    expect(await screen.findByRole('button', { name: 'Retry purchase' })).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Restore purchases' }));
    expect(await screen.findByText('No active Kin+ purchase found.')).toBeTruthy();
  });
});
