import type { SupabaseClient } from '@supabase/supabase-js';

import { RepositoryError } from '@/data/errors';
import { createSupabaseKinRepository } from '../SupabaseKinRepository';
import type { Database } from '../database.types';
import type { InviteRow, MessageRow } from '../mappers';

const USER_ID = '10000000-0000-0000-0000-000000000001';
const PARTNER_ID = '10000000-0000-0000-0000-000000000002';
const SPACE_ID = '20000000-0000-0000-0000-000000000001';
const MESSAGE_ID = '30000000-0000-0000-0000-000000000001';

interface FakeClientOptions {
  rpcErrors?: Partial<Record<string, { message: string; details?: string | null; hint?: string | null }>>;
  removeSpaceAfter?: readonly string[];
  messageRows?: MessageRow[];
  ambiguousSendOnce?: boolean;
  unreadCount?: number;
}

function createFakeClient(options: FakeClientOptions = {}) {
  let hasSpace = true;
  let ambiguousSendPending = options.ambiguousSendOnce ?? false;
  const serverMessages = [...(options.messageRows ?? [])];
  const writes: { table: string; operation: string; payload?: unknown }[] = [];
  const realtimeHandlers: { table: string; callback: () => void }[] = [];
  const uploadedMediaPaths: string[] = [];
  const removedMediaPaths: string[] = [];
  const invite: InviteRow = {
    code: 'KIN123',
    created_at: '2026-09-16T00:00:00.000Z',
    expires_at: '2026-09-23T00:00:00.000Z',
    id: 'invite-1',
    max_uses: 1,
    redeemed_by: null,
    revoked_at: null,
    space_id: SPACE_ID,
    use_count: 0,
  };

  const tableRows = (table: string) => {
    if (table === 'profiles') {
      return [
        { avatar_uri: '', created_at: '2026-09-15T00:00:00.000Z', display_name: 'Maya', id: USER_ID, notification_previews_enabled: true },
        { avatar_uri: '', created_at: '2026-09-15T00:01:00.000Z', display_name: 'Jamie', id: PARTNER_ID, notification_previews_enabled: true },
      ];
    }
    if (!hasSpace) return [];
    if (table === 'kin_space_members') {
      return [
        { archived: false, joined_at: '2026-09-16T00:00:00.000Z', last_read_at: '2026-09-16T00:00:00.000Z', left_at: null, role: 'owner', space_id: SPACE_ID, user_id: USER_ID },
        { archived: false, joined_at: '2026-09-16T00:01:00.000Z', last_read_at: '2026-09-16T00:01:00.000Z', left_at: null, role: 'member', space_id: SPACE_ID, user_id: PARTNER_ID },
      ];
    }
    if (table === 'kin_spaces') {
      return [{ created_at: '2026-09-16T00:00:00.000Z', created_by: USER_ID, id: SPACE_ID, relationship_start_date: null }];
    }
    if (table === 'space_themes') {
      return [
        { nickname: 'My Jamie', space_id: SPACE_ID, theme_id: 'kin', user_id: USER_ID, wallpaper_id: 'paper' },
        { nickname: 'Maya', space_id: SPACE_ID, theme_id: 'kin', user_id: PARTNER_ID, wallpaper_id: 'paper' },
      ];
    }
    if (table === 'space_invites') return [invite];
    if (table === 'content_reports') {
      return [{
        category: 'harassment',
        created_at: '2026-09-16T03:00:00.000Z',
        explanation: '',
        id: 'report-1',
        message_id: MESSAGE_ID,
        reported_user_id: PARTNER_ID,
        reporter_id: USER_ID,
        space_id: SPACE_ID,
        status: 'open',
      }];
    }
    if (table === 'messages') return serverMessages;
    return [];
  };

  const from = jest.fn((table: string) => {
    let useSingle = false;
    const query: Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> = {
      addReaction: undefined,
      delete: jest.fn(() => {
        writes.push({ operation: 'delete', table });
        return query;
      }),
      eq: jest.fn(() => query),
      in: jest.fn(() => query),
      insert: jest.fn((payload: unknown) => {
        writes.push({ operation: 'insert', payload, table });
        return query;
      }),
      is: jest.fn(() => query),
      limit: jest.fn(() => query),
      maybeSingle: jest.fn(() => {
        useSingle = true;
        return query;
      }),
      order: jest.fn(() => query),
      select: jest.fn(() => query),
      single: jest.fn(() => {
        useSingle = true;
        return query;
      }),
      then: (onfulfilled, onrejected) => {
        const rows = tableRows(table);
        return Promise.resolve({ data: useSingle ? rows[0] ?? null : rows, error: null }).then(
          onfulfilled,
          onrejected,
        );
      },
      update: jest.fn((payload: unknown) => {
        writes.push({ operation: 'update', payload, table });
        return query;
      }),
      upsert: jest.fn((payload: unknown) => {
        writes.push({ operation: 'upsert', payload, table });
        return query;
      }),
    };
    return query;
  });

  const rpc = jest.fn(async (name: string, args?: Record<string, unknown>) => {
    const error = options.rpcErrors?.[name];
    if (error) return { data: null, error };
    if (options.removeSpaceAfter?.includes(name)) hasSpace = false;
    if (name === 'create_kin_space' || name === 'redeem_space_invite') {
      return { data: SPACE_ID, error: null };
    }
    if (name === 'rotate_space_invite' || name === 'revoke_space_invite') {
      return { data: invite, error: null };
    }
    if (name === 'submit_content_report') {
      return {
        data: { created_at: '2026-09-16T03:00:00.000Z', id: 'report-1' },
        error: null,
      };
    }
    if (name === 'list_space_messages') {
      const beforeCreatedAt = args?.before_created_at as string | null | undefined;
      const beforeMessageId = args?.before_message_id as string | null | undefined;
      const pageSize = args?.page_size as number;
      const sorted = [...serverMessages].sort((left, right) =>
        right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
      const eligible = beforeCreatedAt && beforeMessageId
        ? sorted.filter((message) =>
            message.created_at < beforeCreatedAt
            || (message.created_at === beforeCreatedAt && message.id < beforeMessageId))
        : sorted;
      return { data: eligible.slice(0, pageSize), error: null };
    }
    if (name === 'send_kin_message') {
      const id = args?.client_message_id as string;
      let row = serverMessages.find((message) => message.id === id);
      if (!row) {
        row = {
          body: args?.message_body as string,
          created_at: '2026-09-17T01:00:00.000Z',
          id,
          kind: args?.message_kind as MessageRow['kind'],
          media_uri: (args?.message_media_uri as string | null | undefined) ?? null,
          sender_id: USER_ID,
          space_id: args?.target_space_id as string,
        };
        serverMessages.push(row);
      }
      if (ambiguousSendPending) {
        ambiguousSendPending = false;
        return { data: null, error: { message: 'connection closed after commit' } };
      }
      return { data: row, error: null };
    }
    if (name === 'mark_space_read') {
      return { data: '2026-09-17T01:01:00.000Z', error: null };
    }
    if (name === 'get_my_unread_counts') {
      return {
        data: [{ space_id: SPACE_ID, unread_count: options.unreadCount ?? 0 }],
        error: null,
      };
    }
    return { data: null, error: null };
  });

  const channel: { on: jest.Mock; subscribe: jest.Mock } = {
    on: jest.fn(),
    subscribe: jest.fn(),
  };
  channel.on.mockImplementation((_event, config: { table: string }, callback: () => void) => {
      realtimeHandlers.push({ callback, table: config.table });
      return channel;
    });
  channel.subscribe.mockReturnValue(channel);
  const client = {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
    channel: jest.fn(() => channel),
    from,
    removeChannel: jest.fn(async () => undefined),
    rpc,
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: jest.fn(async (path: string) => ({
          data: { signedUrl: `https://signed.kin.test/${path}` },
          error: null,
        })),
        remove: jest.fn(async (paths: string[]) => {
          removedMediaPaths.push(...paths);
          return { data: paths, error: null };
        }),
        upload: jest.fn(async (path: string) => {
          uploadedMediaPaths.push(path);
          return { data: { path }, error: null };
        }),
      })),
    },
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    emitRealtime: async (table: string) => {
      for (const handler of realtimeHandlers.filter((item) => item.table === table)) handler.callback();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    rpc,
    removedMediaPaths,
    serverMessages,
    uploadedMediaPaths,
    writes,
  };
}

function messageRows(count: number): MessageRow[] {
  return Array.from({ length: count }, (_, index) => ({
    body: `Message ${index + 1}`,
    created_at: new Date(Date.UTC(2026, 8, 17, 0, index)).toISOString(),
    id: `30000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    kind: 'text',
    media_uri: null,
    sender_id: index % 2 === 0 ? USER_ID : PARTNER_ID,
    space_id: SPACE_ID,
  }));
}

describe('SupabaseKinRepository Space lifecycle', () => {
  it('creates a Space through one atomic RPC and performs no lifecycle table writes', async () => {
    const fake = createFakeClient();
    const repository = createSupabaseKinRepository(fake.client);

    const space = await repository.createSpace({
      otherDisplayName: 'Jamie',
      relationshipStartDate: '2025-12-05',
    });

    expect(space.id).toBe(SPACE_ID);
    expect(fake.rpc.mock.calls.filter(([name]) => name === 'create_kin_space')).toHaveLength(1);
    expect(fake.rpc).toHaveBeenCalledWith('create_kin_space', {
      other_display_name: 'Jamie',
      relationship_start_date: '2025-12-05',
    });
    expect(fake.writes).toEqual([]);
  });

  it('joins through the server lifecycle and uses the server-created relationship preference', async () => {
    const fake = createFakeClient();
    const repository = createSupabaseKinRepository(fake.client);

    const space = await repository.joinSpace({ inviteCode: ' kin123 ' });

    expect(fake.rpc).toHaveBeenCalledWith('redeem_space_invite', { invite_code: 'KIN123' });
    expect(fake.writes).toEqual([]);
    expect(space.preferencesByUser[USER_ID].nickname).toBe('My Jamie');
  });

  it.each([
    ['KIN_INVITE_EXPIRED', 'invite_expired', 'That invitation has expired.'],
    ['KIN_INVITE_REVOKED', 'invite_revoked', 'That invitation was revoked.'],
    ['KIN_INVITE_USED', 'invite_used', 'That invitation has already been used.'],
    ['KIN_INVITE_SELF', 'invite_self', 'You cannot join your own invitation.'],
    ['KIN_INVITE_BLOCKED', 'blocked', 'This connection is unavailable.'],
    ['KIN_SPACE_FULL', 'space_full', 'That Kin Space already has two people.'],
  ])('maps %s to stable product copy', async (machineCode, expectedCode, expectedMessage) => {
    const fake = createFakeClient({
      rpcErrors: {
        redeem_space_invite: {
          details: `private provider details: ${machineCode}`,
          hint: 'secret provider hint',
          message: machineCode,
        },
      },
    });
    const repository = createSupabaseKinRepository(fake.client);

    const result = repository.joinSpace({ inviteCode: 'KIN123' });

    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryError>>({
        code: expectedCode as RepositoryError['code'],
        message: expectedMessage,
      }),
    );
    await expect(result).rejects.not.toMatchObject({ message: expect.stringContaining('provider') });
  });

  it('does not expose unknown provider diagnostics', async () => {
    const fake = createFakeClient({
      rpcErrors: {
        create_kin_space: {
          details: 'private database host and query',
          message: 'unexpected provider failure',
        },
      },
    });
    const repository = createSupabaseKinRepository(fake.client);

    await expect(repository.createSpace({ otherDisplayName: 'Jamie' })).rejects.toMatchObject({
      code: 'save_failed',
      message: 'Kin could not create that Space.',
    });
  });

  it('routes rotate, revoke, and report through actor-free RPC arguments', async () => {
    const fake = createFakeClient();
    const repository = createSupabaseKinRepository(fake.client);

    await repository.rotateSpaceInvite!({ spaceId: SPACE_ID });
    await repository.revokeSpaceInvite!({ spaceId: SPACE_ID });
    const receipt = await repository.submitContentReport!({
      category: 'harassment',
      explanation: 'Please review.',
      messageId: MESSAGE_ID,
      spaceId: SPACE_ID,
    });

    expect(fake.rpc).toHaveBeenCalledWith('rotate_space_invite', { target_space_id: SPACE_ID });
    expect(fake.rpc).toHaveBeenCalledWith('revoke_space_invite', { target_space_id: SPACE_ID });
    expect(fake.rpc).toHaveBeenCalledWith('submit_content_report', {
      report_category: 'harassment',
      report_explanation: 'Please review.',
      target_message_id: MESSAGE_ID,
      target_space_id: SPACE_ID,
    });
    expect(receipt).toEqual({
      createdAt: '2026-09-16T03:00:00.000Z',
      id: 'report-1',
      status: 'submitted',
    });
  });

  it.each(['leave_kin_space', 'block_kin_space_member'])(
    '%s refreshes the snapshot so the departed Space is unavailable',
    async (rpcName) => {
      const fake = createFakeClient({ removeSpaceAfter: [rpcName] });
      const repository = createSupabaseKinRepository(fake.client);
      expect((await repository.load()).spaces).toHaveLength(1);

      if (rpcName === 'leave_kin_space') await repository.leaveSpace!({ spaceId: SPACE_ID });
      else await repository.blockSpaceMember!({ spaceId: SPACE_ID });

      expect(fake.rpc).toHaveBeenCalledWith(rpcName, { target_space_id: SPACE_ID });
      expect((await repository.load()).spaces).toHaveLength(0);
    },
  );
});

describe('SupabaseKinRepository production messaging', () => {
  it('loads only the newest 50 messages after a 51-row has-more probe', async () => {
    const fake = createFakeClient({ messageRows: messageRows(55) });
    const repository = createSupabaseKinRepository(fake.client);

    const snapshot = await repository.load();

    expect(fake.rpc).toHaveBeenCalledWith('list_space_messages', {
      before_created_at: null,
      before_message_id: null,
      page_size: 51,
      target_space_id: SPACE_ID,
    });
    expect(snapshot.messages).toHaveLength(50);
    expect(snapshot.messagePages[SPACE_ID]).toMatchObject({
      hasOlderMessages: true,
      loadedCount: 50,
    });
  });

  it('merges stable older pages without duplicates', async () => {
    const fake = createFakeClient({ messageRows: messageRows(110) });
    const repository = createSupabaseKinRepository(fake.client);
    await repository.load();

    const firstOlderPage = await repository.loadOlderMessages(SPACE_ID);
    const secondOlderPage = await repository.loadOlderMessages(SPACE_ID);
    const snapshot = await repository.load();

    expect(firstOlderPage).toHaveLength(50);
    expect(secondOlderPage).toHaveLength(10);
    expect(new Set(snapshot.messages.map((message) => message.id)).size).toBe(110);
    expect(snapshot.messagePages[SPACE_ID]).toMatchObject({
      hasOlderMessages: false,
      loadedCount: 110,
    });
  });

  it('retries an ambiguous committed send through the same RPC UUID', async () => {
    const fake = createFakeClient({ ambiguousSendOnce: true });
    const repository = createSupabaseKinRepository(fake.client);
    await repository.load();

    const failed = await repository.sendMessage({
      body: 'One durable hello',
      kind: 'text',
      spaceId: SPACE_ID,
    });
    const retried = await repository.retryMessage(failed.id);

    const sends = fake.rpc.mock.calls.filter(([name]) => name === 'send_kin_message');
    expect(failed.deliveryState).toBe('failed');
    expect(retried).toMatchObject({ deliveryState: 'sent', id: failed.id });
    expect(sends).toHaveLength(2);
    expect(sends[0]?.[1]).toMatchObject({ client_message_id: failed.id });
    expect(sends[1]?.[1]).toMatchObject({ client_message_id: failed.id });
    expect(fake.serverMessages.filter((message) => message.id === failed.id)).toHaveLength(1);
  });

  it('reuses one deterministic uploaded object across an ambiguous media retry', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(4),
      ok: true,
    } as Response);
    const fake = createFakeClient({ ambiguousSendOnce: true });
    const repository = createSupabaseKinRepository(fake.client);
    await repository.load();

    const failed = await repository.sendMessage({
      body: 'Photo',
      kind: 'image',
      mediaUri: 'https://images.kin.test/photo.jpg',
      spaceId: SPACE_ID,
    });
    await repository.retryMessage(failed.id);

    expect(fake.uploadedMediaPaths).toEqual([`${SPACE_ID}/${USER_ID}/${failed.id}.jpg`]);
    expect(fake.serverMessages.filter((message) => message.id === failed.id)).toHaveLength(1);
    fetchSpy.mockRestore();
  });

  it('removes an unreferenced deterministic object with a failed local bubble', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(4),
      ok: true,
    } as Response);
    const fake = createFakeClient({
      rpcErrors: { send_kin_message: { message: 'offline' } },
    });
    const repository = createSupabaseKinRepository(fake.client);
    await repository.load();
    const failed = await repository.sendMessage({
      body: 'Photo',
      kind: 'image',
      mediaUri: 'https://images.kin.test/photo.jpg',
      spaceId: SPACE_ID,
    });

    await repository.removeFailedMessage(failed.id);

    expect(fake.removedMediaPaths).toEqual([`${SPACE_ID}/${USER_ID}/${failed.id}.jpg`]);
    expect((await repository.load()).messages).toEqual([]);
    fetchSpy.mockRestore();
  });

  it('reconciles a realtime server echo into the optimistic UUID without duplication', async () => {
    const fake = createFakeClient({ ambiguousSendOnce: true });
    const repository = createSupabaseKinRepository(fake.client);
    await repository.load();
    const failed = await repository.sendMessage({ body: 'Echo me', kind: 'text', spaceId: SPACE_ID });

    await fake.emitRealtime('messages');
    const snapshot = await repository.load();

    expect(snapshot.messages.filter((message) => message.id === failed.id)).toHaveLength(1);
    expect(snapshot.messages.find((message) => message.id === failed.id)?.deliveryState).toBe('sent');
  });

  it('keeps loaded history and local failures when realtime refreshes the newest page', async () => {
    const fake = createFakeClient({
      messageRows: messageRows(60),
      rpcErrors: { send_kin_message: { message: 'offline' } },
    });
    const repository = createSupabaseKinRepository(fake.client);
    await repository.load();
    await repository.loadOlderMessages(SPACE_ID);
    const failed = await repository.sendMessage({ body: 'Keep me', kind: 'text', spaceId: SPACE_ID });

    await fake.emitRealtime('messages');
    const snapshot = await repository.load();

    expect(snapshot.messages.filter((message) => message.spaceId === SPACE_ID)).toHaveLength(61);
    expect(snapshot.messages.find((message) => message.id === failed.id)?.deliveryState).toBe('failed');
    expect(snapshot.messagePages[SPACE_ID]).toMatchObject({ loadedCount: 61 });
  });

  it('marks a Space read through the actor-derived RPC', async () => {
    const fake = createFakeClient({ unreadCount: 3 });
    const repository = createSupabaseKinRepository(fake.client);
    expect((await repository.load()).unreadCounts[SPACE_ID]).toBe(3);
    const emitted: number[] = [];
    repository.subscribe((snapshot) => emitted.push(snapshot.unreadCounts[SPACE_ID] ?? 0));

    await repository.markSpaceRead(SPACE_ID);

    expect(fake.rpc).toHaveBeenCalledWith('mark_space_read', { target_space_id: SPACE_ID });
    expect(emitted.at(-1)).toBe(0);
  });
});
