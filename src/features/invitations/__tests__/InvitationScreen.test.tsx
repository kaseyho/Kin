import { screen, userEvent, waitFor } from '@testing-library/react-native';

import type { StorageAdapter } from '@/data/contracts';
import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import type { KinSpace } from '@/domain/models';
import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { InvitationScreen, type InvitationActions } from '../InvitationScreen';
import { readPendingInvite } from '../pendingInvite';

function createStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => {
      values.delete(key);
    },
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}

const actions: InvitationActions = {
  copy: jest.fn(async () => true),
  share: jest.fn(async () => 'shared'),
};

describe('InvitationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists an incoming invitation before sending a signed-out person to authentication', async () => {
    const storage = createStorage();
    const onAuthenticationRequired = jest.fn();
    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-out"
        inviteCode="kin123"
        onAuthenticationRequired={onAuthenticationRequired}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
    );

    await waitFor(() => expect(onAuthenticationRequired).toHaveBeenCalledTimes(1));
    expect(await readPendingInvite(storage)).toBe('KIN123');
  });

  it('offers an explicit retry when a signed-out invitation cannot be persisted', async () => {
    const values = new Map<string, string>();
    let failNextWrite = true;
    const storage: StorageAdapter = {
      getItem: async (key) => values.get(key) ?? null,
      removeItem: async (key) => {
        values.delete(key);
      },
      setItem: async (key, value) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error('storage unavailable');
        }
        values.set(key, value);
      },
    };
    const onAuthenticationRequired = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-out"
        inviteCode="KIN123"
        onAuthenticationRequired={onAuthenticationRequired}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
    );

    expect(await screen.findByText('Kin could not keep this invitation on this device. Try again.')).toBeTruthy();
    expect(onAuthenticationRequired).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Try saving this invitation again' }));

    await waitFor(() => expect(onAuthenticationRequired).toHaveBeenCalledTimes(1));
    expect(await readPendingInvite(storage)).toBe('KIN123');
  });

  it('persists the invitation through profile setup for a signed-in person without a profile', async () => {
    const storage = createStorage();
    const onProfileRequired = jest.fn();
    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={onProfileRequired}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
    );

    await waitFor(() => expect(onProfileRequired).toHaveBeenCalledTimes(1));
    expect(await readPendingInvite(storage)).toBe('KIN123');
  });

  it('redeems an incoming invitation exactly once and clears the pending handoff on success', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    const joinedSpace = createJoinedSpace();
    const joinSpace = jest.spyOn(repository, 'joinSpace').mockResolvedValue(joinedSpace);
    const storage = createStorage();
    const onSpaceReady = jest.fn();

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={onSpaceReady}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
      repository,
    );

    await waitFor(() => expect(onSpaceReady).toHaveBeenCalledWith('space-joined'));
    expect(joinSpace).toHaveBeenCalledTimes(1);
    expect(joinSpace).toHaveBeenCalledWith({ inviteCode: 'KIN123' });
    expect(await readPendingInvite(storage)).toBeNull();
  });

  it('does not report redemption complete until pending cleanup succeeds', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    jest.spyOn(repository, 'joinSpace').mockResolvedValue(createJoinedSpace());
    const values = new Map<string, string>();
    let failNextRemoval = true;
    const storage: StorageAdapter = {
      getItem: async (key) => values.get(key) ?? null,
      removeItem: async (key) => {
        if (failNextRemoval) {
          failNextRemoval = false;
          throw new Error('storage unavailable');
        }
        values.delete(key);
      },
      setItem: async (key, value) => {
        values.set(key, value);
      },
    };
    const onSpaceReady = jest.fn();
    const user = userEvent.setup();

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={onSpaceReady}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
      repository,
    );

    expect(await screen.findByRole('header', { name: 'Your Kin Space is ready.' })).toBeTruthy();
    expect(onSpaceReady).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Finish opening our Kin Space' }));
    await waitFor(() => expect(onSpaceReady).toHaveBeenCalledWith('space-joined'));
  });

  it('keeps a failed code available and retries only when asked', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    const joinSpace = jest.spyOn(repository, 'joinSpace')
      .mockRejectedValue(new Error('That invitation has expired.'));
    const storage = createStorage();
    const user = userEvent.setup();

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
      repository,
    );

    expect(await screen.findByText('That invitation has expired.')).toBeTruthy();
    expect(screen.getByText('KIN123')).toBeTruthy();
    expect(await readPendingInvite(storage)).toBe('KIN123');
    expect(joinSpace).toHaveBeenCalledTimes(1);

    await user.press(screen.getByRole('button', { name: 'Try this invitation again' }));
    await waitFor(() => expect(joinSpace).toHaveBeenCalledTimes(2));
  });

  it('shows the creator a truthful waiting state with share, copy, replace, and cancel controls', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    const space = await repository.createSpace({ otherDisplayName: 'Jamie' });
    const rotate = jest.spyOn(repository, 'rotateSpaceInvite');
    const revoke = jest.spyOn(repository, 'revokeSpaceInvite');
    const onInvitationChanged = jest.fn();
    const storage = createStorage();
    const user = userEvent.setup();

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onInvitationChanged={onInvitationChanged}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
      repository,
    );

    expect(await screen.findByRole('header', { name: 'Jamie is one tap away.' })).toBeTruthy();
    expect(screen.getByText('https://kin.example/invite/KIN123')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Share invitation' }));
    expect(actions.share).toHaveBeenCalledWith('https://kin.example/invite/KIN123');
    expect(await screen.findByText('Invitation shared.')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Copy invitation link' }));
    expect(actions.copy).toHaveBeenCalledWith('https://kin.example/invite/KIN123');
    expect(await screen.findByText('Link copied.')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Replace invitation code' }));
    await waitFor(() => expect(rotate).toHaveBeenCalledWith({ spaceId: space.id }));
    expect(onInvitationChanged).toHaveBeenCalledWith('KIN123');

    await user.press(screen.getByRole('button', { name: 'Cancel invitation' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith({ spaceId: space.id }));
    expect(await screen.findByRole('header', { name: 'Invitation cancelled.' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share invitation' })).toBeNull();
  });

  it('does not ignore pending-invitation cleanup when the creator opens their own link', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    const space = await repository.createSpace({ otherDisplayName: 'Jamie' });
    let failNextRemoval = true;
    const storage: StorageAdapter = {
      getItem: async () => null,
      removeItem: async () => {
        if (failNextRemoval) {
          failNextRemoval = false;
          throw new Error('storage unavailable');
        }
      },
      setItem: async () => undefined,
    };
    const onSpaceReady = jest.fn();
    const user = userEvent.setup();

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={onSpaceReady}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
      repository,
    );

    expect(await screen.findByRole('header', { name: 'Your Kin Space is ready.' })).toBeTruthy();
    expect(onSpaceReady).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Finish opening our Kin Space' }));
    await waitFor(() => expect(onSpaceReady).toHaveBeenCalledWith(space.id));
  });

  it('removes stale sharing controls as soon as the second person is connected', async () => {
    const seedRepository = createTestRepository();
    const owner = await seedRepository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    const space = await seedRepository.createSpace({ otherDisplayName: 'Jamie' });
    const snapshot = await seedRepository.load();
    snapshot.profiles.push({
      avatarUri: '',
      createdAt: '2026-09-17T00:00:00.000Z',
      displayName: 'Jamie',
      id: 'profile-jamie',
    });
    snapshot.members.push({
      joinedAt: '2026-09-17T00:00:00.000Z',
      role: 'member',
      spaceId: space.id,
      userId: 'profile-jamie',
    });
    const values = new Map<string, string>([['kin.snapshot.v1', JSON.stringify(snapshot)]]);
    const repository = createDemoKinRepository({
      getItem: async (key) => values.get(key) ?? null,
      removeItem: async (key) => {
        values.delete(key);
      },
      setItem: async (key, value) => {
        values.set(key, value);
      },
    });

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={createStorage()}
      />,
      repository,
    );

    expect(await screen.findByRole('header', { name: 'Jamie is here.' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share invitation' })).toBeNull();
    expect(screen.queryByText('https://kin.example/invite/KIN123')).toBeNull();
    expect(owner.id).toBe(snapshot.currentUserId);
  });

  it('restores creator management by Space after a revoked invitation and remount', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    const space = await repository.createSpace({ otherDisplayName: 'Jamie' });
    await repository.revokeSpaceInvite({ spaceId: space.id });
    const rotate = jest.spyOn(repository, 'rotateSpaceInvite');
    const user = userEvent.setup();

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        hostSpaceId={space.id}
        inviteCode=""
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={createStorage()}
      />,
      repository,
    );

    expect(await screen.findByRole('header', { name: 'No active invitation.' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share invitation' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Create a new invitation' }));
    await waitFor(() => expect(rotate).toHaveBeenCalledWith({ spaceId: space.id }));
    expect(await screen.findByRole('header', { name: 'Jamie is one tap away.' })).toBeTruthy();
  });

  it('does not offer an expired persisted demo invitation for sharing', async () => {
    const values = new Map<string, string>();
    let now = '2026-09-01T00:00:00.000Z';
    const repository = createDemoKinRepository({
      getItem: async (key) => values.get(key) ?? null,
      removeItem: async (key) => {
        values.delete(key);
      },
      setItem: async (key, value) => {
        values.set(key, value);
      },
    }, {
      inviteCode: () => 'KIN123',
      now: () => now,
    });
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    const space = await repository.createSpace({ otherDisplayName: 'Jamie' });
    now = '2026-09-20T00:00:00.000Z';

    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        hostSpaceId={space.id}
        inviteCode="KIN123"
        onAuthenticationRequired={jest.fn()}
        onDismiss={jest.fn()}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={createStorage()}
      />,
      repository,
    );

    expect(await screen.findByRole('header', { name: 'Invitation expired.' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share invitation' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Create a new invitation' })).toBeTruthy();
  });

  it('clears an invalid or unwanted invitation before dismissing it', async () => {
    const onDismiss = jest.fn();
    const user = userEvent.setup();
    let failNextRemoval = true;
    const storage: StorageAdapter = {
      getItem: async () => null,
      removeItem: async () => {
        if (failNextRemoval) {
          failNextRemoval = false;
          throw new Error('storage unavailable');
        }
      },
      setItem: async () => undefined,
    };
    await renderKin(
      <InvitationScreen
        actions={actions}
        authStatus="signed-in"
        inviteCode="../bad"
        onAuthenticationRequired={jest.fn()}
        onDismiss={onDismiss}
        onProfileRequired={jest.fn()}
        onSpaceReady={jest.fn()}
        publicAppUrl="https://kin.example"
        storage={storage}
      />,
    );

    expect(screen.getByRole('header', { name: 'This invitation link is not valid.' })).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Leave invitation' }));
    expect(await screen.findByText('Kin could not clear this invitation from this device. Try leaving again.')).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Leave invitation' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

function createJoinedSpace(): KinSpace {
  return {
    archivedByUserIds: [],
    createdAt: '2026-09-17T00:00:00.000Z',
    createdBy: 'profile-owner',
    id: 'space-joined',
    inviteCode: '',
    preferencesByUser: {},
    stickerIds: [],
  };
}
