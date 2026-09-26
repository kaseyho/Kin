export type Id = string;
export type ISODate = `${number}-${number}-${number}`;
export type ISODateTime = string;
export type MemoryKind = 'moment' | 'important_date' | 'plan';
export type MemoryVisibility = 'private' | 'shared';
export type MessageKind = 'text' | 'image' | 'sticker';
export type DeliveryState = 'sending' | 'sent' | 'failed';
export type InvitationStatus = 'active' | 'expired' | 'revoked' | 'used';

export const CONTENT_REPORT_CATEGORIES = [
  'harassment',
  'threats',
  'hate',
  'sexual_content',
  'spam',
  'other',
] as const;

export type ContentReportCategory = typeof CONTENT_REPORT_CATEGORIES[number];

export function isContentReportCategory(value: unknown): value is ContentReportCategory {
  return typeof value === 'string'
    && (CONTENT_REPORT_CATEGORIES as readonly string[]).includes(value);
}

export interface UserProfile {
  id: Id;
  displayName: string;
  avatarUri: string;
  createdAt: ISODateTime;
}

export interface RelationshipPreferences {
  nickname: string;
  themeId: string;
  wallpaperId: string;
}

export interface SpaceInvitation {
  id: Id;
  spaceId: Id;
  code: string;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  revokedAt?: ISODateTime;
  redeemedBy?: Id;
  useCount: number;
  maxUses: number;
  status: InvitationStatus;
}

export interface KinSpace {
  id: Id;
  createdBy: Id;
  inviteCode: string;
  activeInvitation?: SpaceInvitation;
  createdAt: ISODateTime;
  relationshipStartDate?: ISODate;
  preferencesByUser: Record<Id, RelationshipPreferences>;
  archivedByUserIds: Id[];
  stickerIds: Id[];
}

export interface ContentReportReceipt {
  id: Id;
  createdAt: ISODateTime;
  status: 'submitted';
}

export interface SpaceMember {
  spaceId: Id;
  userId: Id;
  role: 'owner' | 'member';
  joinedAt: ISODateTime;
}

export interface Reaction {
  emoji: string;
  userId: Id;
  createdAt: ISODateTime;
}

export interface Message {
  id: Id;
  spaceId: Id;
  senderId: Id;
  kind: MessageKind;
  body: string;
  mediaUri?: string;
  createdAt: ISODateTime;
  reactions: Reaction[];
  deliveryState: DeliveryState;
}

export interface MessagePageState {
  hasOlderMessages: boolean;
  loadedCount: number;
  oldestCreatedAt?: ISODateTime;
  oldestMessageId?: Id;
}

export interface MemoryItem {
  id: Id;
  spaceId: Id;
  createdBy: Id;
  kind: MemoryKind;
  visibility: MemoryVisibility;
  title: string;
  occurredOn: ISODate;
  note: string;
  place?: string;
  sourceMessageIds: Id[];
  mediaUris: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface KinSnapshot {
  schemaVersion: 1;
  currentUserId: Id | null;
  profiles: UserProfile[];
  spaces: KinSpace[];
  members: SpaceMember[];
  messages: Message[];
  messagePages: Record<Id, MessagePageState>;
  unreadCounts: Record<Id, number>;
  memories: MemoryItem[];
}

export interface EntitlementState {
  isKinPlus: boolean;
  source: 'demo' | 'revenuecat' | 'unavailable';
  expiresAt?: ISODateTime;
  canManageSubscription?: boolean;
}

export interface KinPlusPackage {
  id: string;
  title: string;
  priceLabel: string;
  billingPeriodLabel?: string;
  trialLabel?: string;
}

export interface KinPlusOffering {
  id: string;
  packages: KinPlusPackage[];
}

export interface CreateMemoryInput {
  id: Id;
  spaceId: Id;
  createdBy: Id;
  kind: MemoryKind;
  visibility?: MemoryVisibility;
  title: string;
  occurredOn: string;
  note?: string;
  place?: string;
  sourceMessageIds: Id[];
  mediaUris?: string[];
  now: ISODateTime;
}
