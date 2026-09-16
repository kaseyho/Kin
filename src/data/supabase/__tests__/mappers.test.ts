import {
  getInvitationStatus,
  mapMemory,
  mapMessage,
  mapProfile,
  mapSpace,
} from '../mappers';

const activeInvite = {
  code: 'KIN123',
  created_at: '2026-09-13T08:00:00.000Z',
  expires_at: '2026-09-20T08:00:00.000Z',
  id: 'invite-1',
  max_uses: 1,
  redeemed_by: null,
  revoked_at: null,
  space_id: 'space-1',
  use_count: 0,
};

it('maps profiles, Spaces, themes, messages, reactions, and remembered sources', () => {
  expect(mapProfile({
    avatar_uri: 'https://cdn/avatar.png',
    created_at: '2026-09-13T08:00:00.000Z',
    display_name: 'Maya',
    id: 'maya',
  })).toEqual({
    avatarUri: 'https://cdn/avatar.png',
    createdAt: '2026-09-13T08:00:00.000Z',
    displayName: 'Maya',
    id: 'maya',
  });

  expect(mapSpace(
    {
      created_at: '2026-09-13T08:00:00.000Z',
      created_by: 'maya',
      id: 'space-1',
      relationship_start_date: '2025-12-05',
    },
    [{ archived: false, joined_at: '2026-09-13T08:00:00.000Z', role: 'owner', space_id: 'space-1', user_id: 'maya' }],
    [{ nickname: 'Jamie', space_id: 'space-1', theme_id: 'moonlit', user_id: 'maya', wallpaper_id: 'stars' }],
    [activeInvite],
    '2026-09-14T08:00:00.000Z',
  )).toMatchObject({
    activeInvitation: {
      code: 'KIN123',
      id: 'invite-1',
      status: 'active',
    },
    archivedByUserIds: [],
    inviteCode: 'KIN123',
    preferencesByUser: { maya: { nickname: 'Jamie', themeId: 'moonlit', wallpaperId: 'stars' } },
    relationshipStartDate: '2025-12-05',
  });

  expect(mapMessage({
    body: 'Dinner?',
    created_at: '2026-09-13T08:00:00.000Z',
    id: 'message-1',
    kind: 'text',
    media_uri: null,
    sender_id: 'jamie',
    space_id: 'space-1',
  }, [{ created_at: '2026-09-13T08:01:00.000Z', emoji: '❤️', message_id: 'message-1', user_id: 'maya' }]))
    .toMatchObject({ deliveryState: 'sent', reactions: [{ emoji: '❤️', userId: 'maya' }] });

  expect(mapMemory({
    created_at: '2026-09-13T08:00:00.000Z',
    created_by: 'maya',
    id: 'memory-1',
    kind: 'moment',
    media_uris: ['photo.jpg'],
    note: 'Warm noodles.',
    occurred_on: '2025-12-05',
    place: null,
    space_id: 'space-1',
    title: 'Our first date',
    updated_at: '2026-09-13T08:00:00.000Z',
    visibility: 'private',
  }, [{ memory_id: 'memory-1', message_id: 'message-1' }]))
    .toMatchObject({ sourceMessageIds: ['message-1'], visibility: 'private' });
});

it.each([
  [{ ...activeInvite }, 'active'],
  [{ ...activeInvite, expires_at: '2026-09-14T07:59:59.000Z' }, 'expired'],
  [{ ...activeInvite, revoked_at: '2026-09-14T07:00:00.000Z' }, 'revoked'],
  [{ ...activeInvite, redeemed_by: 'jamie', use_count: 1 }, 'used'],
] as const)('derives durable invitation state', (invite, expected) => {
  expect(getInvitationStatus(invite, '2026-09-14T08:00:00.000Z')).toBe(expected);
});

it('does not surface stale invitations as active', () => {
  const space = mapSpace(
    {
      created_at: '2026-09-13T08:00:00.000Z',
      created_by: 'maya',
      id: 'space-1',
      relationship_start_date: null,
    },
    [],
    [],
    [
      { ...activeInvite, id: 'invite-revoked', revoked_at: '2026-09-14T07:00:00.000Z' },
      { ...activeInvite, code: 'NEW456', created_at: '2026-09-14T07:30:00.000Z', id: 'invite-active' },
    ],
    '2026-09-14T08:00:00.000Z',
  );

  expect(space.activeInvitation).toMatchObject({ code: 'NEW456', status: 'active' });
  expect(space.inviteCode).toBe('NEW456');
});
