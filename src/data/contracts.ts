import type {
  Id,
  ISODate,
  ContentReportCategory,
  ContentReportReceipt,
  KinSnapshot,
  KinSpace,
  MemoryItem,
  MemoryKind,
  MemoryVisibility,
  Message,
  MessageKind,
  SpaceInvitation,
  UserProfile,
} from '@/domain/models';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SaveProfileInput {
  displayName: string;
  avatarUri: string;
}

export interface CreateSpaceInput {
  otherDisplayName: string;
  relationshipStartDate?: ISODate;
}

export interface JoinSpaceInput {
  inviteCode: string;
}

export interface RotateSpaceInviteInput {
  spaceId: Id;
}

export interface RevokeSpaceInviteInput {
  spaceId: Id;
}

export interface LeaveSpaceInput {
  spaceId: Id;
}

export interface BlockSpaceMemberInput {
  spaceId: Id;
}

export interface SubmitContentReportInput {
  spaceId: Id;
  messageId?: Id;
  category: ContentReportCategory;
  explanation?: string;
}

export interface SendMessageInput {
  spaceId: Id;
  kind: MessageKind;
  body: string;
  mediaUri?: string;
}

export interface AddReactionInput {
  messageId: Id;
  emoji: string;
}

export interface UpdateSpacePreferencesInput {
  spaceId: Id;
  userId: Id;
  nickname: string;
  themeId: string;
  wallpaperId: string;
}

export interface SaveMemoryInput {
  spaceId: Id;
  kind: MemoryKind;
  visibility?: MemoryVisibility;
  title: string;
  occurredOn: string;
  note?: string;
  place?: string;
  sourceMessageIds: Id[];
  mediaUris?: string[];
}

export interface UpdateMemoryInput {
  memoryId: Id;
  title: string;
  occurredOn?: string;
  note?: string;
  place?: string;
  visibility?: MemoryVisibility;
}

export interface KinRepository {
  readonly mode: 'connected' | 'demo';
  load(): Promise<KinSnapshot>;
  subscribe(listener: (snapshot: KinSnapshot) => void): () => void;
  resetDemo(): Promise<KinSnapshot>;
  saveProfile(input: SaveProfileInput): Promise<UserProfile>;
  createSpace(input: CreateSpaceInput): Promise<KinSpace>;
  joinSpace(input: JoinSpaceInput): Promise<KinSpace>;
  rotateSpaceInvite(input: RotateSpaceInviteInput): Promise<SpaceInvitation>;
  revokeSpaceInvite(input: RevokeSpaceInviteInput): Promise<SpaceInvitation>;
  leaveSpace(input: LeaveSpaceInput): Promise<void>;
  blockSpaceMember(input: BlockSpaceMemberInput): Promise<void>;
  submitContentReport(input: SubmitContentReportInput): Promise<ContentReportReceipt>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  retryMessage(messageId: Id): Promise<Message>;
  addReaction(input: AddReactionInput): Promise<Message>;
  updateSpacePreferences(input: UpdateSpacePreferencesInput): Promise<KinSpace>;
  saveMemory(input: SaveMemoryInput): Promise<MemoryItem>;
  updateMemory(input: UpdateMemoryInput): Promise<MemoryItem>;
  deleteMemory(memoryId: Id): Promise<void>;
  archiveSpace(spaceId: Id, userId: Id, archived: boolean): Promise<void>;
  deleteLocalSpace(spaceId: Id, userId: Id, confirmation: string): Promise<void>;
}
