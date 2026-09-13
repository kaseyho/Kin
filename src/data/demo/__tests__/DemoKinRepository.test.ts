import type { StorageAdapter } from '../../contracts';
import { RepositoryError } from '../../errors';
import { createDemoKinRepository } from '../DemoKinRepository';

function createMemoryStorage(initial: string | null = null): StorageAdapter & { value: () => string | null } {
  let stored = initial;
  return {
    getItem: async () => stored,
    setItem: async (_key, value) => {
      stored = value;
    },
    removeItem: async () => {
      stored = null;
    },
    value: () => stored,
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

  it('joins a known invitation and keeps an invalid code recoverable', async () => {
    const repository = createRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: 'maya.png' });
    const created = await repository.createSpace({ otherDisplayName: 'Jamie' });

    expect((await repository.joinSpace({ inviteCode: created.inviteCode.toLowerCase() })).id).toBe(
      created.id,
    );
    await expect(repository.joinSpace({ inviteCode: 'NOPE00' })).rejects.toMatchObject({
      code: 'invite_invalid',
    });
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
