import type { StorageAdapter } from '../../contracts';
import { RepositoryError } from '../../errors';
import { createDemoKinRepository } from '../DemoKinRepository';

function createMemoryStorage(initial: string | null = null): StorageAdapter & {
  value: (key?: string) => string | null;
} {
  const stored = new Map<string, string>();
  if (initial !== null) stored.set('kin.snapshot.v1', initial);
  return {
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => {
      stored.set(key, value);
    },
    removeItem: async (key) => {
      stored.delete(key);
    },
    value: (key = 'kin.snapshot.v1') => stored.get(key) ?? null,
  };
}

function createRepository(storage = createMemoryStorage()) {
  let sequence = 0;
  return createDemoKinRepository(storage, {
    id: (kind) => `${kind}-${++sequence}`,
    inviteCode: () => 'KIN123',
    now: () => '2026-09-13T08:00:00.000Z',
  });
}

describe('DemoKinRepository', () => {
  it('starts empty and loads the complete story only when demo mode is requested', async () => {
    const repository = createRepository();

    expect((await repository.load()).currentUserId).toBeNull();

    const demo = await repository.resetDemo();
    expect(demo.currentUserId).toBe('maya');
    expect(demo.spaces).toHaveLength(1);
    expect(demo.messages.length).toBeGreaterThanOrEqual(8);
    expect(demo.memories.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['moment', 'plan']),
    );
  });

  it('persists a profile and relationship-specific preferences across instances', async () => {
    const storage = createMemoryStorage();
    const repository = createRepository(storage);
    await repository.resetDemo();

    await repository.updateSpacePreferences({
      spaceId: 'space-maya-jamie',
      userId: 'maya',
      nickname: 'Jamie ♥',
      themeId: 'moonlit',
      wallpaperId: 'letters',
    });

    const reloaded = await createRepository(storage).load();
    expect(reloaded.spaces[0].preferencesByUser.maya).toEqual({
      nickname: 'Jamie ♥',
      themeId: 'moonlit',
      wallpaperId: 'letters',
    });
  });

  it('supports the complete local mutation contract', async () => {
    const repository = createRepository();
    await repository.load();
    const profile = await repository.saveProfile({ displayName: 'Maya', avatarUri: 'maya.png' });
    const space = await repository.createSpace({
      otherDisplayName: 'Jamie',
      relationshipStartDate: '2025-12-05',
    });

    expect(profile.displayName).toBe('Maya');
    expect(space.inviteCode).toBe('KIN123');
    expect(space.activeInvitation?.status).toBe('active');
    expect((await repository.load()).members).toEqual([
      expect.objectContaining({ role: 'owner', spaceId: space.id, userId: profile.id }),
    ]);

    const sent = await repository.sendMessage({
      spaceId: space.id,
      kind: 'text',
      body: ' Dinner this Saturday? ',
    });
    expect(sent).toMatchObject({ body: 'Dinner this Saturday?', deliveryState: 'sent' });

    const reacted = await repository.addReaction({ messageId: sent.id, emoji: '❤️' });
    expect(reacted.reactions).toHaveLength(1);

    const memory = await repository.saveMemory({
      spaceId: space.id,
      kind: 'moment',
      title: 'Dinner plans',
      occurredOn: '2026-09-13',
      sourceMessageIds: [sent.id],
    });
    expect(memory.visibility).toBe('private');

    const updated = await repository.updateMemory({
      memoryId: memory.id,
      title: 'Saturday dinner',
      note: 'Pick somewhere warm.',
    });
    expect(updated.title).toBe('Saturday dinner');

    await repository.deleteMemory(memory.id);
    expect((await repository.load()).memories).toHaveLength(0);
  });

  it('refreshes a persisted invitation status when it expires', async () => {
    let now = '2026-09-01T00:00:00.000Z';
    const repository = createDemoKinRepository(createMemoryStorage(), {
      inviteCode: () => 'KIN123',
      now: () => now,
    });
    await repository.saveProfile({ displayName: 'Maya', avatarUri: '' });
    await repository.createSpace({ otherDisplayName: 'Jamie' });

    now = '2026-09-20T00:00:00.000Z';

    expect((await repository.load()).spaces[0].activeInvitation?.status).toBe('expired');
  });

  it('joins a known invitation and keeps an invalid code recoverable', async () => {
    const storage = createMemoryStorage(JSON.stringify({
      currentUserId: 'maya',
      members: [{
        joinedAt: '2026-09-13T08:00:00.000Z',
        role: 'owner',
        spaceId: 'space-joinable',
        userId: 'jamie',
      }],
      memories: [],
      messages: [],
      profiles: [
        { avatarUri: 'maya.png', createdAt: '2026-09-13T08:00:00.000Z', displayName: 'Maya', id: 'maya' },
        { avatarUri: 'jamie.png', createdAt: '2026-09-13T08:00:00.000Z', displayName: 'Jamie', id: 'jamie' },
      ],
      schemaVersion: 1,
      spaces: [{
        activeInvitation: {
          code: 'KIN123',
          createdAt: '2026-09-13T08:00:00.000Z',
          expiresAt: '2026-09-20T08:00:00.000Z',
          id: 'invite-joinable',
          maxUses: 1,
          spaceId: 'space-joinable',
          status: 'active',
          useCount: 0,
        },
        archivedByUserIds: [],
        createdAt: '2026-09-13T08:00:00.000Z',
        createdBy: 'jamie',
        id: 'space-joinable',
        inviteCode: 'KIN123',
        preferencesByUser: {
          jamie: { nickname: 'Maya', themeId: 'kin', wallpaperId: 'paper' },
        },
        stickerIds: [],
      }],
    }));
    const repository = createRepository(storage);

    const joined = await repository.joinSpace({ inviteCode: 'kin123' });
    expect(joined.id).toBe('space-joinable');
    expect(joined.activeInvitation).toBeUndefined();
    expect(joined.inviteCode).toBe('');
    expect((await repository.load()).members).toHaveLength(2);
    await expect(repository.joinSpace({ inviteCode: 'NOPE00' })).rejects.toMatchObject({
      code: 'invite_invalid',
    });
  });

  it('rotates and revokes a waiting invitation with explicit statuses', async () => {
    const codes = ['KIN123', 'KIN456'];
    let sequence = 0;
    const repository = createDemoKinRepository(createMemoryStorage(), {
      id: (kind) => `${kind}-${++sequence}`,
      inviteCode: () => codes.shift() ?? 'KIN789',
      now: () => '2026-09-13T08:00:00.000Z',
    });
    await repository.saveProfile({ displayName: 'Maya', avatarUri: 'maya.png' });
    const space = await repository.createSpace({ otherDisplayName: 'Jamie' });

    const rotated = await repository.rotateSpaceInvite!({ spaceId: space.id });
    expect(rotated).toMatchObject({ code: 'KIN456', status: 'active' });

    const revoked = await repository.revokeSpaceInvite!({ spaceId: space.id });
    expect(revoked).toMatchObject({ code: 'KIN456', status: 'revoked' });
    expect((await repository.load()).spaces[0]).toMatchObject({ inviteCode: '' });
    expect((await repository.load()).spaces[0].activeInvitation).toBeUndefined();
  });

  it('keeps report details in developer-only storage and removes blocked relationship access', async () => {
    const storage = createMemoryStorage();
    const repository = createRepository(storage);
    await repository.resetDemo();

    await expect(repository.submitContentReport!({
      category: 'harassment',
      messageId: 'missing-message',
      spaceId: 'space-maya-jamie',
    })).rejects.toMatchObject({ code: 'report_invalid' });

    const receipt = await repository.submitContentReport!({
      category: 'harassment',
      explanation: 'Please review this message.',
      messageId: 'message-1',
      spaceId: 'space-maya-jamie',
    });
    expect(receipt).toMatchObject({ status: 'submitted' });
    expect(storage.value()).not.toContain('Please review this message.');
    expect(storage.value('kin.safety.v1')).toContain('Please review this message.');

    await repository.blockSpaceMember!({ spaceId: 'space-maya-jamie' });
    expect((await repository.load()).spaces).toHaveLength(0);
    expect(storage.value('kin.safety.v1')).toContain('jamie');
  });

  it('removes a departed Space from the current demo user view', async () => {
    const repository = createRepository();
    await repository.resetDemo();

    await repository.leaveSpace!({ spaceId: 'space-maya-jamie' });

    expect((await repository.load()).spaces).toHaveLength(0);
    expect((await repository.load()).messages).toHaveLength(0);
    expect((await repository.load()).memories).toHaveLength(0);
  });

  it('keeps a failed send in place and retries the same message id', async () => {
    let shouldFail = true;
    const repository = createDemoKinRepository(createMemoryStorage(), {
      id: (kind) => `${kind}-1`,
      inviteCode: () => 'KIN123',
      now: () => '2026-09-13T08:00:00.000Z',
      failNextSend: () => {
        const result = shouldFail;
        shouldFail = false;
        return result;
      },
    });
    await repository.saveProfile({ displayName: 'Maya', avatarUri: 'maya.png' });
    const space = await repository.createSpace({ otherDisplayName: 'Jamie' });

    const failed = await repository.sendMessage({
      spaceId: space.id,
      kind: 'text',
      body: 'Dinner this Saturday?',
    });
    expect(failed.deliveryState).toBe('failed');

    const retried = await repository.retryMessage(failed.id);
    expect(retried).toMatchObject({ id: failed.id, deliveryState: 'sent' });
    expect((await repository.load()).messages).toHaveLength(1);
  });

  it('archives reversibly and requires exact confirmation for local deletion', async () => {
    const repository = createRepository();
    const demo = await repository.resetDemo();

    await repository.archiveSpace('space-maya-jamie', 'maya', true);
    expect((await repository.load()).spaces[0].archivedByUserIds).toContain('maya');
    await repository.archiveSpace('space-maya-jamie', 'maya', false);
    expect((await repository.load()).spaces[0].archivedByUserIds).not.toContain('maya');

    await expect(
      repository.deleteLocalSpace('space-maya-jamie', demo.currentUserId!, 'delete'),
    ).rejects.toMatchObject({ code: 'confirmation_required' });
    await repository.deleteLocalSpace('space-maya-jamie', demo.currentUserId!, 'DELETE');
    expect((await repository.load()).spaces).toHaveLength(0);
  });

  it('emits one canonical snapshot for one successful mutation', async () => {
    const repository = createRepository();
    await repository.load();
    const listener = jest.fn();
    repository.subscribe(listener);

    await repository.saveProfile({ displayName: 'Maya', avatarUri: 'maya.png' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].profiles[0].displayName).toBe('Maya');
  });

  it('fails closed on corrupt data without overwriting it', async () => {
    const storage = createMemoryStorage('{not-json');
    const repository = createRepository(storage);

    await expect(repository.load()).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryError>>({ code: 'demo_snapshot_corrupt' }),
    );
    expect(storage.value()).toBe('{not-json');
  });
});
