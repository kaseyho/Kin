import { render, screen, userEvent } from '@testing-library/react-native';

import type { PremiumService } from '@/services/billing/contracts';
import { BillingError } from '@/services/billing/contracts';
import { createDemoPremiumService } from '@/services/billing/demo';
import { KinPlusScreen } from '../KinPlusScreen';
import { PremiumProvider } from '../PremiumProvider';

async function renderPremium(service: PremiumService) {
  return render(
    <PremiumProvider service={service}>
      <KinPlusScreen onClose={jest.fn()} />
    </PremiumProvider>,
  );
}

describe('KinPlusScreen', () => {
  it('unlocks the labeled demo entitlement', async () => {
    const user = userEvent.setup();
    await renderPremium(createDemoPremiumService(false));

    expect(await screen.findByText('Relationship themes')).toBeTruthy();
    expect(screen.getByText('Unlimited Moments')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Try Kin+ in demo' }));
    expect(await screen.findByRole('header', { name: 'Kin+ is active' })).toBeTruthy();
    expect(screen.getByText(/Demo entitlement/)).toBeTruthy();
  });

  it('explains unavailable browser billing without hiding Restore', async () => {
    const service: PremiumService = {
      getEntitlement: async () => ({ isKinPlus: false, source: 'unavailable' }),
      subscribe: () => () => undefined,
      getOffering: async () => null,
      purchase: async () => { throw new BillingError('unavailable', 'Billing unavailable'); },
      restore: async () => ({ isKinPlus: false, source: 'unavailable' }),
    };
    await renderPremium(service);

    expect(await screen.findByText('Purchases need a configured development build')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy();
  });

  it('treats cancellation quietly, offers Retry after failure, and reports an empty restore', async () => {
    let attempts = 0;
    const service: PremiumService = {
      getEntitlement: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      subscribe: () => () => undefined,
      getOffering: async () => ({
        id: 'default',
        packages: [{ id: 'monthly', title: 'Monthly', priceLabel: '$3.99' }],
      }),
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
