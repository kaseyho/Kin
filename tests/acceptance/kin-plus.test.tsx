import { render, screen, userEvent } from '@testing-library/react-native';

import { PersonalizeSpaceSheet } from '@/features/spaces/PersonalizeSpaceSheet';
import { KinProvider } from '@/state/KinProvider';
import { PremiumProvider } from '@/features/premium/PremiumProvider';
import { KinPlusScreen } from '@/features/premium/KinPlusScreen';
import { createDemoPremiumService } from '@/services/billing/demo';
import { createTestRepository } from '../helpers/renderKin';

it('carries a demo Kin+ entitlement into premium relationship expression', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  const billing = createDemoPremiumService(false);
  const user = userEvent.setup();
  const result = await render(
    <PremiumProvider authState={{ status: 'demo' }} deployment="demo" service={billing}>
      <KinProvider repository={repository}>
        <KinPlusScreen onClose={jest.fn()} />
      </KinProvider>
    </PremiumProvider>,
  );
  await user.press(await screen.findByRole('button', { name: 'Try Kin+ in demo' }));
  expect(await screen.findByRole('header', { name: 'Kin+ is active' })).toBeTruthy();

  await result.rerender(
    <PremiumProvider authState={{ status: 'demo' }} deployment="demo" service={billing}>
      <KinProvider repository={repository}>
        <PersonalizeSpaceSheet
          onClose={jest.fn()}
          onRequestKinPlus={jest.fn()}
          spaceId="space-maya-jamie"
        />
      </KinProvider>
    </PremiumProvider>,
  );
  await user.press(await screen.findByRole('button', { name: 'Evergreen theme' }));
  await user.press(screen.getByRole('button', { name: 'Save changes' }));
  expect((await repository.load()).spaces[0].preferencesByUser.maya.themeId).toBe('evergreen');
});
