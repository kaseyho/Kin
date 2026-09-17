import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { PremiumProvider } from '@/features/premium/PremiumProvider';
import { createDemoPremiumService } from '@/services/billing/demo';
import { createDemoAccountService } from '@/services/account/demo';
import { AuthContext, type AuthContextValue } from '@/state/AuthProvider';
import { KinProvider } from '@/state/KinProvider';
import { createTestRepository } from '../../../../tests/helpers/renderKin';
import { ProfileScreen } from '../ProfileScreen';

it('opens profile editing from the current identity card', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  const auth: AuthContextValue = {
    accountService: createDemoAccountService(),
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

it('exposes export and deletion only for a connected signed-in account', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  Object.assign(repository, { mode: 'connected' as const });
  const accountService = {
    deleteAccount: async () => ({ deleted: true as const }),
    exportData: async () => ({
      exportedAt: '2026-09-16T00:00:00.000Z',
      profile: null,
      version: 1 as const,
    }),
    requestFreshOtp: async () => undefined,
    verifyFreshOtp: async () => undefined,
  };
  const auth: AuthContextValue = {
    accountService,
    requestOtp: async () => undefined,
    signOut: async () => undefined,
    state: { status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } },
    verifyOtp: async (email) => ({ email, id: 'maya' }),
  };
  await render(
    <AuthContext.Provider value={auth}>
      <PremiumProvider service={createDemoPremiumService()}>
        <KinProvider repository={repository}>
          <ProfileScreen onOpenKinPlus={jest.fn()} onSignedOut={jest.fn()} />
        </KinProvider>
      </PremiumProvider>
    </AuthContext.Provider>,
  );

  expect(await screen.findByRole('button', { name: 'Export my data' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
});

it('reports a failed Space restore and lets the user retry', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  await repository.archiveSpace('space-maya-jamie', 'maya', true);
  const originalArchive = repository.archiveSpace.bind(repository);
  const archive = jest.spyOn(repository, 'archiveSpace')
    .mockRejectedValueOnce(new Error('Connection interrupted.'))
    .mockImplementation(originalArchive);
  const auth: AuthContextValue = {
    accountService: createDemoAccountService(),
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

  await user.press(await screen.findByRole('button', { name: 'Restore Kin Space with Jamie' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted.');

  await user.press(screen.getByRole('button', { name: 'Try restoring Kin Space with Jamie' }));
  await waitFor(() => expect(archive).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Jamie')).toBeNull());
});
