import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { StorageAdapter } from '@/data/contracts';
import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import { KinProvider } from '../KinProvider';
import { useKin } from '../useKin';

const storage: StorageAdapter = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

function Probe() {
  const kin = useKin();
  return <Text>{`${kin.status}:${kin.snapshot?.currentUserId ?? 'none'}`}</Text>;
}

function LifecycleProbe() {
  const kin = useKin();
  return (
    <>
      <Pressable onPress={() => kin.rotateSpaceInvite({ spaceId: 'space-1' })}>
        <Text>Rotate invitation</Text>
      </Pressable>
      <Pressable onPress={() => kin.revokeSpaceInvite({ spaceId: 'space-1' })}>
        <Text>Revoke invitation</Text>
      </Pressable>
      <Pressable onPress={() => kin.leaveSpace({ spaceId: 'space-1' })}>
        <Text>Leave Space</Text>
      </Pressable>
      <Pressable onPress={() => kin.blockSpaceMember({ spaceId: 'space-1' })}>
        <Text>Block member</Text>
      </Pressable>
      <Pressable
        onPress={() => kin.submitContentReport({ category: 'spam', spaceId: 'space-1' })}
      >
        <Text>Submit report</Text>
      </Pressable>
    </>
  );
}

describe('KinProvider', () => {
  it('loads an empty first run and publishes the explicit demo reset', async () => {
    const repository = createDemoKinRepository(storage);
    await render(
      <KinProvider repository={repository}>
        <Probe />
      </KinProvider>,
    );

    expect(await screen.findByText('ready:none')).toBeTruthy();
    await act(async () => {
      await repository.resetDemo();
    });
    expect(await screen.findByText('ready:maya')).toBeTruthy();
  });

  it('does not load private data while inactive and clears it when deactivated', async () => {
    const repository = createDemoKinRepository(storage);
    const view = await render(
      <KinProvider active={false} repository={repository}>
        <Probe />
      </KinProvider>,
    );

    expect(screen.getByText('idle:none')).toBeTruthy();

    await view.rerender(
      <KinProvider active repository={repository}>
        <Probe />
      </KinProvider>,
    );
    expect(await screen.findByText('ready:none')).toBeTruthy();

    await view.rerender(
      <KinProvider active={false} repository={repository}>
        <Probe />
      </KinProvider>,
    );
    expect(screen.getByText('idle:none')).toBeTruthy();
  });

  it('delegates each Space lifecycle action without adding client authorization rules', async () => {
    const repository = createDemoKinRepository(storage);
    const rotateSpaceInvite = jest.fn(async () => ({
      code: 'KIN456',
      createdAt: '2026-09-16T00:00:00.000Z',
      expiresAt: '2026-09-23T00:00:00.000Z',
      id: 'invite-1',
      maxUses: 1,
      spaceId: 'space-1',
      status: 'active' as const,
      useCount: 0,
    }));
    const revokeSpaceInvite = jest.fn(rotateSpaceInvite);
    const leaveSpace = jest.fn(async () => undefined);
    const blockSpaceMember = jest.fn(async () => undefined);
    const submitContentReport = jest.fn(async () => ({
      createdAt: '2026-09-16T00:00:00.000Z',
      id: 'report-1',
      status: 'submitted' as const,
    }));
    Object.assign(repository, {
      blockSpaceMember,
      leaveSpace,
      revokeSpaceInvite,
      rotateSpaceInvite,
      submitContentReport,
    });

    await render(
      <KinProvider active={false} repository={repository}>
        <LifecycleProbe />
      </KinProvider>,
    );

    await act(async () => fireEvent.press(screen.getByText('Rotate invitation')));
    await act(async () => fireEvent.press(screen.getByText('Revoke invitation')));
    await act(async () => fireEvent.press(screen.getByText('Leave Space')));
    await act(async () => fireEvent.press(screen.getByText('Block member')));
    await act(async () => fireEvent.press(screen.getByText('Submit report')));

    expect(rotateSpaceInvite).toHaveBeenCalledWith({ spaceId: 'space-1' });
    expect(revokeSpaceInvite).toHaveBeenCalledWith({ spaceId: 'space-1' });
    expect(leaveSpace).toHaveBeenCalledWith({ spaceId: 'space-1' });
    expect(blockSpaceMember).toHaveBeenCalledWith({ spaceId: 'space-1' });
    expect(submitContentReport).toHaveBeenCalledWith({ category: 'spam', spaceId: 'space-1' });
  });
});
