import { screen, userEvent } from '@testing-library/react-native';

import { AuthContext, type AuthContextValue } from '@/state/AuthProvider';
import { createDemoAccountService } from '@/services/account/demo';
import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { ChatListScreen } from '../../chats/ChatListScreen';
import { ProfileScreen } from '../../profile/ProfileScreen';
import { RelationshipPanel } from '../RelationshipPanel';

describe('RelationshipPanel', () => {
  it('keeps relationship context in the intended hierarchy without judgment copy', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    await renderKin(
      <RelationshipPanel
        onOpenKinPlus={jest.fn()}
        onOpenTimeline={jest.fn()}
        onSpaceUnavailable={jest.fn()}
        spaceId="space-maya-jamie"
        today="2026-09-13"
      />,
      repository,
    );

    const sections = (await screen.findByTestId('relationship-sections')).children
      .filter((child): child is Exclude<typeof child, string> => typeof child !== 'string')
      .map((child) => child.props.testID)
      .filter(Boolean);
    expect(sections.slice(0, 8)).toEqual([
      'relationship-identity',
      'relationship-on-this-day',
      'relationship-upcoming',
      'relationship-recent-moments',
      'relationship-timeline',
      'relationship-media-stickers',
      'relationship-personalization',
      'relationship-kin-plus',
    ]);
    expect(screen.getAllByText('Noodles after the rain')).toHaveLength(2);
    expect(screen.getByText('Visit the new art museum')).toBeTruthy();
    expect(screen.queryByText(/score|declining|text less/i)).toBeNull();
  });

  it('archives reversibly from Profile', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const user = userEvent.setup();
    const panel = await renderKin(
      <RelationshipPanel
        onOpenKinPlus={jest.fn()}
        onOpenTimeline={jest.fn()}
        onSpaceUnavailable={jest.fn()}
        spaceId="space-maya-jamie"
        today="2026-09-13"
      />,
      repository,
    );

    await user.press(await screen.findByRole('button', { name: 'Archive this Kin Space' }));
    await panel.unmount();
    const chats = await renderKin(
      <ChatListScreen onNewSpace={jest.fn()} onOpenSpace={jest.fn()} />,
      repository,
    );
    expect(await screen.findByText('A space for the people who matter.')).toBeTruthy();
    await chats.unmount();

    const auth: AuthContextValue = {
      accountService: createDemoAccountService(),
      requestOtp: async () => undefined,
      signOut: async () => undefined,
      state: { status: 'demo' },
      verifyOtp: async (email) => ({ email, id: 'demo' }),
    };
    const profile = await renderKin(
      <AuthContext.Provider value={auth}>
        <ProfileScreen onOpenKinPlus={jest.fn()} onOpenLegal={jest.fn()} onSignedOut={jest.fn()} />
      </AuthContext.Provider>,
      repository,
    );
    await user.press(await screen.findByRole('button', { name: 'Restore Kin Space with Jamie' }));
    await profile.unmount();
    await renderKin(<ChatListScreen onNewSpace={jest.fn()} onOpenSpace={jest.fn()} />, repository);
    expect(await screen.findByRole('button', { name: 'Open Kin Space with Jamie' })).toBeTruthy();
  });

  it('requires exact confirmation before deleting only the local Space copy', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const onSpaceUnavailable = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <RelationshipPanel
        onOpenKinPlus={jest.fn()}
        onOpenTimeline={jest.fn()}
        onSpaceUnavailable={onSpaceUnavailable}
        spaceId="space-maya-jamie"
        today="2026-09-13"
      />,
      repository,
    );

    await user.press(await screen.findByRole('button', { name: 'Delete local copy' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    await user.press(screen.getByRole('button', { name: 'Confirm local deletion' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Type DELETE exactly/);
    expect((await repository.load()).spaces).toHaveLength(1);

    await user.clear(screen.getByLabelText('Type DELETE to confirm'));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.press(screen.getByRole('button', { name: 'Confirm local deletion' }));
    expect((await repository.load()).spaces).toHaveLength(0);
    expect(onSpaceUnavailable).toHaveBeenCalledTimes(1);
  });
});
