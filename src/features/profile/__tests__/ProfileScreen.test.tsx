import { render, screen, userEvent } from '@testing-library/react-native';

import { PremiumProvider } from '@/features/premium/PremiumProvider';
import { createDemoPremiumService } from '@/services/billing/demo';
import { AuthContext, type AuthContextValue } from '@/state/AuthProvider';
import { KinProvider } from '@/state/KinProvider';
import { createTestRepository } from '../../../../tests/helpers/renderKin';
import { ProfileScreen } from '../ProfileScreen';

it('opens profile editing from the current identity card', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  const auth: AuthContextValue = {
    requestOtp: async () => undefined,
    signOut: async () => undefined,
    state: { status: 'demo' },
    verifyOtp: async (email) => ({ email, id: 'demo' }),
  };
  const user = userEvent.setup();
  await render(
    <AuthContext.Provider value={auth}>
      <PremiumProvider service={createDemoPremiumService()}>
        <KinProvider repository={repository}>
          <ProfileScreen onOpenKinPlus={jest.fn()} onSignedOut={jest.fn()} />
        </KinProvider>
      </PremiumProvider>
    </AuthContext.Provider>,
  );

  await user.press(await screen.findByRole('button', { name: 'Edit profile' }));

  expect(screen.getByRole('header', { name: 'Edit profile' })).toBeTruthy();
  expect(screen.getByLabelText('Display name')).toHaveProp('value', 'Maya');
});
