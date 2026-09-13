import type {
  KinSpace,
  MemoryItem,
  Message,
  Reaction,
  RelationshipPreferences,
  SpaceMember,
  UserProfile,
} from '@/domain/models';

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_uri: string;
  created_at: string;
}

export interface SpaceRow {
  id: string;
  created_by: string;
  created_at: string;
  relationship_start_date: string | null;
}

export interface MemberRow {
  space_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  archived: boolean;
}

export interface ThemeRow {
  space_id: string;
  user_id: string;
  nickname: string;
  theme_id: string;
  wallpaper_id: string;
}

export interface InviteRow {
  space_id: string;
  code: string;
}

export interface MessageRow {
  id: string;
  space_id: string;
  sender_id: string;
  kind: Message['kind'];
  body: string;
  media_uri: string | null;
  created_at: string;
}

export interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  space_id: string;
  created_by: string;
  kind: MemoryItem['kind'];
  visibility: MemoryItem['visibility'];
  title: string;
  occurred_on: string;
  note: string;
  place: string | null;
  media_uris: string[];
  created_at: string;
  updated_at: string;
}

export interface MemoryMessageRow {
  memory_id: string;
  message_id: string;
}

export function mapProfile(row: ProfileRow): UserProfile {
  return { avatarUri: row.avatar_uri, createdAt: row.created_at, displayName: row.display_name, id: row.id };
}

export function mapMember(row: MemberRow): SpaceMember {
  return { joinedAt: row.joined_at, role: row.role, spaceId: row.space_id, userId: row.user_id };
}

export function mapSpace(
  row: SpaceRow,
  members: readonly MemberRow[],
  themes: readonly ThemeRow[],
  invites: readonly InviteRow[],
): KinSpace {
  const preferencesByUser: Record<string, RelationshipPreferences> = {};
  for (const theme of themes.filter((item) => item.space_id === row.id)) {
    preferencesByUser[theme.user_id] = {
      nickname: theme.nickname,
      themeId: theme.theme_id,
      wallpaperId: theme.wallpaper_id,
    };
  }
  return {
    archivedByUserIds: members.filter((item) => item.space_id === row.id && item.archived).map((item) => item.user_id),
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    inviteCode: invites.find((item) => item.space_id === row.id)?.code ?? '',
    ...(row.relationship_start_date ? { relationshipStartDate: row.relationship_start_date as KinSpace['relationshipStartDate'] } : {}),
    preferencesByUser,
    stickerIds: [],
  };
}

export function mapReaction(row: ReactionRow): Reaction {
  return { createdAt: row.created_at, emoji: row.emoji, userId: row.user_id };
}

export function mapMessage(row: MessageRow, reactions: readonly ReactionRow[]): Message {
  return {
    body: row.body,
    createdAt: row.created_at,
    deliveryState: 'sent',
    id: row.id,
    kind: row.kind,
    ...(row.media_uri ? { mediaUri: row.media_uri } : {}),
    reactions: reactions.filter((item) => item.message_id === row.id).map(mapReaction),
    senderId: row.sender_id,
    spaceId: row.space_id,
  };
}

export function mapMemory(row: MemoryRow, links: readonly MemoryMessageRow[]): MemoryItem {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    kind: row.kind,
    mediaUris: row.media_uris,
    note: row.note,
    occurredOn: row.occurred_on as MemoryItem['occurredOn'],
    ...(row.place ? { place: row.place } : {}),
    sourceMessageIds: links.filter((item) => item.memory_id === row.id).map((item) => item.message_id),
    spaceId: row.space_id,
    title: row.title,
    updatedAt: row.updated_at,
    visibility: row.visibility,
  };
}
