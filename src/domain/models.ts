export type Id = string;
export type ISODate = `${number}-${number}-${number}`;
export type ISODateTime = string;
export type MemoryKind = 'moment' | 'important_date' | 'plan';
export type MemoryVisibility = 'private' | 'shared';
export type MessageKind = 'text' | 'image' | 'sticker';
export type DeliveryState = 'sending' | 'sent' | 'failed';

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

export interface KinSpace {
  id: Id;
  createdBy: Id;
  inviteCode: string;
  createdAt: ISODateTime;
  relationshipStartDate?: ISODate;
  preferencesByUser: Record<Id, RelationshipPreferences>;
  archivedByUserIds: Id[];
  stickerIds: Id[];
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
  memories: MemoryItem[];
}

export interface EntitlementState {
  isKinPlus: boolean;
  source: 'demo' | 'revenuecat' | 'unavailable';
  expiresAt?: ISODateTime;
}

export interface KinPlusPackage {
  id: string;
  title: string;
  priceLabel: string;
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
