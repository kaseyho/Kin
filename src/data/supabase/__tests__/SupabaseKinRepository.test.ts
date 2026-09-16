import type { SupabaseClient } from '@supabase/supabase-js';

import { RepositoryError } from '@/data/errors';
import { createSupabaseKinRepository } from '../SupabaseKinRepository';
import type { Database } from '../database.types';
import type { InviteRow } from '../mappers';

const USER_ID = '10000000-0000-0000-0000-000000000001';
const PARTNER_ID = '10000000-0000-0000-0000-000000000002';
const SPACE_ID = '20000000-0000-0000-0000-000000000001';
const MESSAGE_ID = '30000000-0000-0000-0000-000000000001';

interface FakeClientOptions {
  rpcErrors?: Partial<Record<string, { message: string; details?: string | null; hint?: string | null }>>;
  removeSpaceAfter?: readonly string[];
}

function createFakeClient(options: FakeClientOptions = {}) {
  let hasSpace = true;
  const writes: { table: string; operation: string; payload?: unknown }[] = [];
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
        { avatar_uri: '', created_at: '2026-09-15T00:00:00.000Z', display_name: 'Maya', id: USER_ID },
        { avatar_uri: '', created_at: '2026-09-15T00:01:00.000Z', display_name: 'Jamie', id: PARTNER_ID },
      ];
    }
    if (!hasSpace) return [];
    if (table === 'kin_space_members') {
      return [
        { archived: false, joined_at: '2026-09-16T00:00:00.000Z', left_at: null, role: 'owner', space_id: SPACE_ID, user_id: USER_ID },
        { archived: false, joined_at: '2026-09-16T00:01:00.000Z', left_at: null, role: 'member', space_id: SPACE_ID, user_id: PARTNER_ID },
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

  const rpc = jest.fn(async (name: string) => {
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
    return { data: null, error: null };
  });

  const channel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  };
  const client = {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
    channel: jest.fn(() => channel),
    from,
    removeChannel: jest.fn(async () => undefined),
    rpc,
  } as unknown as SupabaseClient<Database>;

  return { client, rpc, writes };
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
    expect(fake.rpc).toHaveBeenCalledTimes(1);
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
