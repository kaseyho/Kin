import {
  mapMemory,
  mapMessage,
  mapProfile,
  mapSpace,
} from '../mappers';

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
    [{ code: 'KIN123', space_id: 'space-1' }],
  )).toMatchObject({
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
