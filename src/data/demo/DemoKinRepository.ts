import { createMemoryItem } from '@/domain/commands';
import type { Id, KinSnapshot, KinSpace, MemoryItem, Message, UserProfile } from '@/domain/models';
import type {
  AddReactionInput,
  CreateSpaceInput,
  JoinSpaceInput,
  KinRepository,
  SaveMemoryInput,
  SaveProfileInput,
  SendMessageInput,
  StorageAdapter,
  UpdateMemoryInput,
  UpdateSpacePreferencesInput,
} from '../contracts';
import { RepositoryError } from '../errors';
import { createDemoSnapshot, createEmptySnapshot } from './seed';

const STORAGE_KEY = 'kin.snapshot.v1';

interface DemoRepositoryDependencies {
  now?: () => string;
  id?: (kind: 'profile' | 'space' | 'message' | 'memory') => Id;
  inviteCode?: () => string;
  failNextSend?: () => boolean;
}

export function createDemoKinRepository(
  storage: StorageAdapter,
  dependencies: DemoRepositoryDependencies = {},
): KinRepository {
  return new DemoKinRepository(storage, dependencies);
}

class DemoKinRepository implements KinRepository {
  readonly mode = 'demo' as const;
  private snapshot: KinSnapshot | null = null;
  private readonly listeners = new Set<(snapshot: KinSnapshot) => void>();
  private sequence = 0;
  private readonly now: () => string;
  private readonly makeId: NonNullable<DemoRepositoryDependencies['id']>;
  private readonly makeInviteCode: () => string;
  private readonly failNextSend: () => boolean;

  constructor(
    private readonly storage: StorageAdapter,
    dependencies: DemoRepositoryDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.makeId =
      dependencies.id ??
      ((kind) => `${kind}-${Date.now().toString(36)}-${(this.sequence += 1).toString(36)}`);
    this.makeInviteCode =
      dependencies.inviteCode ??
      (() => Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'K'));
    this.failNextSend = dependencies.failNextSend ?? (() => false);
  }

  async load(): Promise<KinSnapshot> {
    if (this.snapshot) return clone(this.snapshot);

    const stored = await this.storage.getItem(STORAGE_KEY);
    if (stored === null) {
      this.snapshot = createEmptySnapshot();
      return clone(this.snapshot);
    }

    try {
      const parsed: unknown = JSON.parse(stored);
      if (!isSnapshot(parsed)) throw new Error('Unsupported Kin snapshot');
      this.snapshot = parsed;
      return clone(this.snapshot);
    } catch {
      throw new RepositoryError(
        'demo_snapshot_corrupt',
        'Kin could not read the saved demo. Reset it to start safely.',
        'reset',
      );
    }
  }

  subscribe(listener: (snapshot: KinSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async resetDemo(): Promise<KinSnapshot> {
    return this.commit(createDemoSnapshot());
  }

  async saveProfile(input: SaveProfileInput): Promise<UserProfile> {
    const snapshot = await this.current();
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new RepositoryError('profile_required', 'Tell Kin what to call you.', 'onboard');
    }

    const existing = snapshot.profiles.find((profile) => profile.id === snapshot.currentUserId);
    const profile: UserProfile = existing
      ? { ...existing, displayName, avatarUri: input.avatarUri }
      : {
          id: this.makeUniqueId('profile', snapshot),
          displayName,
          avatarUri: input.avatarUri,
          createdAt: this.now(),
        };

    const next = clone(snapshot);
    next.currentUserId = profile.id;
    next.profiles = existing
      ? next.profiles.map((item) => (item.id === profile.id ? profile : item))
      : [...next.profiles, profile];
    await this.commit(next);
    return clone(profile);
  }

  async createSpace(input: CreateSpaceInput): Promise<KinSpace> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    const otherDisplayName = input.otherDisplayName.trim();
    if (!otherDisplayName) {
      throw new RepositoryError('profile_required', 'Who is this Kin Space for?', 'onboard');
    }

    const otherProfile: UserProfile = {
      id: this.makeUniqueId('profile', snapshot),
      displayName: otherDisplayName,
      avatarUri: 'asset://kin/jamie',
      createdAt: this.now(),
    };
    const space: KinSpace = {
      id: this.makeUniqueId('space', snapshot),
      createdBy: currentProfile.id,
      inviteCode: this.makeInviteCode().trim().toUpperCase(),
      createdAt: this.now(),
      relationshipStartDate: input.relationshipStartDate,
      preferencesByUser: {
        [currentProfile.id]: {
          nickname: otherDisplayName,
          themeId: 'kin',
          wallpaperId: 'paper',
        },
        [otherProfile.id]: {
          nickname: currentProfile.displayName,
          themeId: 'kin',
          wallpaperId: 'paper',
        },
      },
      archivedByUserIds: [],
      stickerIds: [],
    };
    const joinedAt = this.now();
    const next: KinSnapshot = {
      ...clone(snapshot),
      profiles: [...snapshot.profiles, otherProfile],
      spaces: [...snapshot.spaces, space],
      members: [
        ...snapshot.members,
        { spaceId: space.id, userId: currentProfile.id, role: 'owner', joinedAt },
        { spaceId: space.id, userId: otherProfile.id, role: 'member', joinedAt },
      ],
    };
    await this.commit(next);
    return clone(space);
  }

  async joinSpace(input: JoinSpaceInput): Promise<KinSpace> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    const inviteCode = input.inviteCode.trim().toUpperCase();
    const space = snapshot.spaces.find((item) => item.inviteCode === inviteCode);
    if (!space) {
      throw new RepositoryError(
        'invite_invalid',
        'That invite could not be found. Check the code and try again.',
        'reenter',
      );
    }

    if (!snapshot.members.some((member) => member.spaceId === space.id && member.userId === currentProfile.id)) {
      const next = clone(snapshot);
      next.members.push({
        spaceId: space.id,
        userId: currentProfile.id,
        role: 'member',
        joinedAt: this.now(),
      });
      await this.commit(next);
    }
    return clone(space);
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    const body = input.body.trim();
    if (!body && !input.mediaUri) {
      throw new RepositoryError('message_invalid', 'Write a message or choose something to send.');
    }

    const message: Message = {
      id: this.makeUniqueId('message', snapshot),
      spaceId: input.spaceId,
      senderId: currentProfile.id,
      kind: input.kind,
      body,
      mediaUri: input.mediaUri,
      createdAt: this.now(),
      reactions: [],
      deliveryState: 'sending',
    };
    const pending = clone(snapshot);
    pending.messages.push(message);
    await this.commit(pending);

    const deliveryState = this.failNextSend() ? 'failed' : 'sent';
    const delivered = await this.setMessageState(message.id, deliveryState);
    if (deliveryState === 'sent' && input.kind === 'text') {
      await this.appendDeterministicReply(delivered);
    }
    return delivered;
  }

  async retryMessage(messageId: Id): Promise<Message> {
    const snapshot = await this.current();
    const message = this.requireMessage(snapshot, messageId);
    if (message.deliveryState !== 'failed') return clone(message);
    await this.setMessageState(messageId, 'sending');
    return this.setMessageState(messageId, 'sent');
  }

  async addReaction(input: AddReactionInput): Promise<Message> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    const message = this.requireMessage(snapshot, input.messageId);
    this.requireMembership(snapshot, message.spaceId, currentProfile.id);
    const exists = message.reactions.some(
      (reaction) => reaction.userId === currentProfile.id && reaction.emoji === input.emoji,
    );
    const updated: Message = {
      ...message,
      reactions: exists
        ? message.reactions.filter(
            (reaction) =>
              !(reaction.userId === currentProfile.id && reaction.emoji === input.emoji),
          )
        : [
            ...message.reactions,
            { emoji: input.emoji, userId: currentProfile.id, createdAt: this.now() },
          ],
    };
    const next = clone(snapshot);
    next.messages = next.messages.map((item) => (item.id === updated.id ? updated : item));
    await this.commit(next);
    return clone(updated);
  }

  async updateSpacePreferences(input: UpdateSpacePreferencesInput): Promise<KinSpace> {
    const snapshot = await this.current();
    this.requireMembership(snapshot, input.spaceId, input.userId);
    const space = this.requireSpace(snapshot, input.spaceId);
    const updated: KinSpace = {
      ...space,
      preferencesByUser: {
        ...space.preferencesByUser,
        [input.userId]: {
          nickname: input.nickname.trim(),
          themeId: input.themeId,
          wallpaperId: input.wallpaperId,
        },
      },
    };
    const next = clone(snapshot);
    next.spaces = next.spaces.map((item) => (item.id === updated.id ? updated : item));
    await this.commit(next);
    return clone(updated);
  }

  async saveMemory(input: SaveMemoryInput): Promise<MemoryItem> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    const memory = createMemoryItem({
      ...input,
      id: this.makeUniqueId('memory', snapshot),
      createdBy: currentProfile.id,
      now: this.now(),
    });
    const next = clone(snapshot);
    next.memories.push(memory);
    await this.commit(next);
    return clone(memory);
  }

  async updateMemory(input: UpdateMemoryInput): Promise<MemoryItem> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    const existing = this.requireMemory(snapshot, input.memoryId);
    if (existing.createdBy !== currentProfile.id) {
      throw new RepositoryError('forbidden', 'Only the person who kept this can edit it.');
    }
    const updated = createMemoryItem({
      id: existing.id,
      spaceId: existing.spaceId,
      createdBy: existing.createdBy,
      kind: existing.kind,
      visibility: input.visibility ?? existing.visibility,
      title: input.title,
      occurredOn: input.occurredOn ?? existing.occurredOn,
      note: input.note ?? existing.note,
      place: input.place ?? existing.place,
      sourceMessageIds: existing.sourceMessageIds,
      mediaUris: existing.mediaUris,
      now: this.now(),
    });
    updated.createdAt = existing.createdAt;
    const next = clone(snapshot);
    next.memories = next.memories.map((item) => (item.id === updated.id ? updated : item));
    await this.commit(next);
    return clone(updated);
  }

  async deleteMemory(memoryId: Id): Promise<void> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    const memory = this.requireMemory(snapshot, memoryId);
    if (memory.createdBy !== currentProfile.id) {
      throw new RepositoryError('forbidden', 'Only the person who kept this can delete it.');
    }
    const next = clone(snapshot);
    next.memories = next.memories.filter((item) => item.id !== memoryId);
    await this.commit(next);
  }

  async archiveSpace(spaceId: Id, userId: Id, archived: boolean): Promise<void> {
    const snapshot = await this.current();
    this.requireMembership(snapshot, spaceId, userId);
    const space = this.requireSpace(snapshot, spaceId);
    const archivedIds = new Set(space.archivedByUserIds);
    if (archived) archivedIds.add(userId);
    else archivedIds.delete(userId);
    const next = clone(snapshot);
    next.spaces = next.spaces.map((item) =>
      item.id === spaceId ? { ...item, archivedByUserIds: [...archivedIds] } : item,
    );
    await this.commit(next);
  }

  async deleteLocalSpace(
    spaceId: Id,
    userId: Id,
    confirmation: string,
  ): Promise<void> {
    if (confirmation !== 'DELETE') {
      throw new RepositoryError(
        'confirmation_required',
        'Type DELETE to remove this local Kin Space.',
      );
    }
    const snapshot = await this.current();
    this.requireMembership(snapshot, spaceId, userId);
    const next = clone(snapshot);
    next.spaces = next.spaces.filter((space) => space.id !== spaceId);
    next.members = next.members.filter((member) => member.spaceId !== spaceId);
    next.messages = next.messages.filter((message) => message.spaceId !== spaceId);
    next.memories = next.memories.filter((memory) => memory.spaceId !== spaceId);
    await this.commit(next);
  }

  private async appendDeterministicReply(sent: Message): Promise<void> {
    const snapshot = await this.current();
    const partner = snapshot.members.find(
      (member) => member.spaceId === sent.spaceId && member.userId !== sent.senderId,
    );
    if (!partner) return;

    const reply: Message = {
      body: /saturday/i.test(sent.body)
        ? 'Saturday sounds perfect. I’ll make it cozy.'
        : 'I’m here. Tell me more.',
      createdAt: this.now(),
      deliveryState: 'sent',
      id: this.makeUniqueId('message', snapshot),
      kind: 'text',
      reactions: [],
      senderId: partner.userId,
      spaceId: sent.spaceId,
    };
    const next = clone(snapshot);
    next.messages.push(reply);
    await this.commit(next);
  }

  private async current(): Promise<KinSnapshot> {
    return this.snapshot ? clone(this.snapshot) : this.load();
  }

  private makeUniqueId(
    kind: 'profile' | 'space' | 'message' | 'memory',
    snapshot: KinSnapshot,
  ): Id {
    const candidate = this.makeId(kind);
    const existingIds = new Set([
      ...snapshot.profiles.map((item) => item.id),
      ...snapshot.spaces.map((item) => item.id),
      ...snapshot.messages.map((item) => item.id),
      ...snapshot.memories.map((item) => item.id),
    ]);
    if (!existingIds.has(candidate)) return candidate;

    let suffix = 2;
    while (existingIds.has(`${candidate}-${suffix}`)) suffix += 1;
    return `${candidate}-${suffix}`;
  }

  private async setMessageState(
    messageId: Id,
    deliveryState: Message['deliveryState'],
  ): Promise<Message> {
    const snapshot = await this.current();
    const message = this.requireMessage(snapshot, messageId);
    const updated = { ...message, deliveryState };
    const next = clone(snapshot);
    next.messages = next.messages.map((item) => (item.id === messageId ? updated : item));
    await this.commit(next);
    return clone(updated);
  }

  private async commit(snapshot: KinSnapshot): Promise<KinSnapshot> {
    const canonical = clone(snapshot);
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(canonical));
    this.snapshot = canonical;
    for (const listener of this.listeners) listener(clone(canonical));
    return clone(canonical);
  }

  private requireCurrentProfile(snapshot: KinSnapshot): UserProfile {
    const profile = snapshot.profiles.find((item) => item.id === snapshot.currentUserId);
    if (!profile) {
      throw new RepositoryError('profile_required', 'Create your profile first.', 'onboard');
    }
    return profile;
  }

  private requireMembership(snapshot: KinSnapshot, spaceId: Id, userId: Id): void {
    if (!snapshot.members.some((member) => member.spaceId === spaceId && member.userId === userId)) {
      throw new RepositoryError('forbidden', 'This Kin Space is private to its members.');
    }
  }

  private requireSpace(snapshot: KinSnapshot, spaceId: Id): KinSpace {
    const space = snapshot.spaces.find((item) => item.id === spaceId);
    if (!space) throw new RepositoryError('not_found', 'That Kin Space could not be found.');
    return space;
  }

  private requireMessage(snapshot: KinSnapshot, messageId: Id): Message {
    const message = snapshot.messages.find((item) => item.id === messageId);
    if (!message) throw new RepositoryError('not_found', 'That message could not be found.');
    return message;
  }

  private requireMemory(snapshot: KinSnapshot, memoryId: Id): MemoryItem {
    const memory = snapshot.memories.find((item) => item.id === memoryId);
    if (!memory) throw new RepositoryError('not_found', 'That memory could not be found.');
    return memory;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isSnapshot(value: unknown): value is KinSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<KinSnapshot>;
  return (
    candidate.schemaVersion === 1 &&
    Array.isArray(candidate.profiles) &&
    Array.isArray(candidate.spaces) &&
    Array.isArray(candidate.members) &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.memories)
  );
}
