import { createMemoryItem } from '@/domain/commands';
import { FREE_MEMORY_LIMIT } from '@/domain/limits';
import {
  isContentReportCategory,
  type ContentReportCategory,
  type ContentReportReceipt,
  type Id,
  type KinSnapshot,
  type KinSpace,
  type MemoryItem,
  type Message,
  type SpaceInvitation,
  type UserProfile,
} from '@/domain/models';
import { MAX_MESSAGE_IMAGE_BYTES, MESSAGE_IMAGE_MIME_TYPES } from '@/services/media/contracts';
import type {
  AddReactionInput,
  BlockSpaceMemberInput,
  CreateSpaceInput,
  JoinSpaceInput,
  KinRepository,
  LeaveSpaceInput,
  RevokeSpaceInviteInput,
  RotateSpaceInviteInput,
  SaveMemoryInput,
  SaveProfileInput,
  SendMessageInput,
  StorageAdapter,
  SubmitContentReportInput,
  UpdateMemoryInput,
  UpdateSpacePreferencesInput,
} from '../contracts';
import { RepositoryError } from '../errors';
import { createDemoSnapshot, createEmptySnapshot } from './seed';

const STORAGE_KEY = 'kin.snapshot.v1';
const SAFETY_STORAGE_KEY = 'kin.safety.v1';

interface DemoSafetyState {
  version: 1;
  blocks: {
    blockerId: Id;
    blockedId: Id;
    spaceId: Id;
    createdAt: string;
  }[];
  invitations: SpaceInvitation[];
  reports: {
    id: Id;
    reporterId: Id;
    reportedUserId: Id;
    spaceId: Id;
    messageId?: Id;
    category: ContentReportCategory;
    explanation: string;
    createdAt: string;
  }[];
}

interface DemoRepositoryDependencies {
  now?: () => string;
  id?: (kind: 'profile' | 'space' | 'message' | 'memory' | 'invitation' | 'report') => Id;
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
  private safety: DemoSafetyState | null = null;
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
    if (this.snapshot) {
      this.snapshot = normalizeDemoMessagePages(
        refreshDemoInvitationStatuses(this.snapshot, this.now()),
      );
      return clone(this.snapshot);
    }

    const stored = await this.storage.getItem(STORAGE_KEY);
    if (stored === null) {
      this.snapshot = createEmptySnapshot();
      return clone(this.snapshot);
    }

    try {
      const parsed: unknown = JSON.parse(stored);
      if (!isSnapshot(parsed)) throw new Error('Unsupported Kin snapshot');
      this.snapshot = normalizeDemoMessagePages(
        refreshDemoInvitationStatuses(parsed, this.now()),
      );
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
    await this.commitSafety(createEmptySafetyState());
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

    const spaceId = this.makeUniqueId('space', snapshot);
    const invitation = this.createInvitation(spaceId);
    const space: KinSpace = {
      activeInvitation: invitation,
      id: spaceId,
      createdBy: currentProfile.id,
      inviteCode: invitation.code,
      createdAt: this.now(),
      relationshipStartDate: input.relationshipStartDate,
      preferencesByUser: {
        [currentProfile.id]: {
          nickname: otherDisplayName,
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
      spaces: [...snapshot.spaces, space],
      members: [
        ...snapshot.members,
        { spaceId: space.id, userId: currentProfile.id, role: 'owner', joinedAt },
      ],
    };
    const safety = await this.currentSafety();
    await this.commitSafety({
      ...safety,
      invitations: [...safety.invitations, invitation],
    });
    await this.commit(next);
    return clone(space);
  }

  async joinSpace(input: JoinSpaceInput): Promise<KinSpace> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    const inviteCode = input.inviteCode.trim().toUpperCase();
    const safety = await this.currentSafety();
    const storedInvitation = [...safety.invitations]
      .reverse()
      .find((item) => item.code === inviteCode);
    const visibleInvitation = snapshot.spaces
      .map((space) => space.activeInvitation)
      .find((item) => item?.code === inviteCode);
    const invitation = storedInvitation ?? visibleInvitation;
    if (!invitation) {
      throw new RepositoryError(
        'invite_invalid',
        'That invite could not be found. Check the code and try again.',
        'reenter',
      );
    }
    const status = getDemoInvitationStatus(invitation, this.now());
    if (status === 'expired') {
      throw new RepositoryError('invite_expired', 'That invitation has expired.', 'reenter');
    }
    if (status === 'revoked') {
      throw new RepositoryError('invite_revoked', 'That invitation was revoked.', 'reenter');
    }
    if (status === 'used') {
      throw new RepositoryError('invite_used', 'That invitation has already been used.', 'reenter');
    }
    const space = this.requireSpace(snapshot, invitation.spaceId);
    if (space.createdBy === currentProfile.id) {
      throw new RepositoryError('invite_self', 'You cannot join your own invitation.', 'reenter');
    }
    if (snapshot.members.some(
      (member) => member.spaceId === space.id && member.userId === currentProfile.id,
    )) {
      throw new RepositoryError('already_member', 'You already belong to that Kin Space.', 'reenter');
    }
    const existingMembers = snapshot.members.filter((member) => member.spaceId === space.id);
    if (existingMembers.length >= 2) {
      throw new RepositoryError('space_full', 'That Kin Space already has two people.', 'reenter');
    }
    const partnerId = existingMembers[0]?.userId;
    if (partnerId && safety.blocks.some((block) => isBlockedPair(block, currentProfile.id, partnerId))) {
      throw new RepositoryError('blocked', 'This connection is unavailable.', 'reenter');
    }

    const usedInvitation: SpaceInvitation = {
      ...invitation,
      redeemedBy: currentProfile.id,
      status: 'used',
      useCount: invitation.maxUses,
    };
    const next = clone(snapshot);
    next.members.push({
      spaceId: space.id,
      userId: currentProfile.id,
      role: 'member',
      joinedAt: this.now(),
    });
    next.spaces = next.spaces.map((item) => item.id === space.id
      ? {
          ...item,
          activeInvitation: undefined,
          inviteCode: '',
          preferencesByUser: {
            ...item.preferencesByUser,
            [currentProfile.id]: {
              nickname: partnerId
                ? snapshot.profiles.find((profile) => profile.id === partnerId)?.displayName ?? 'Your person'
                : 'Your person',
              themeId: 'kin',
              wallpaperId: 'paper',
            },
          },
        }
      : item);
    await this.commitSafety({
      ...safety,
      invitations: upsertInvitation(safety.invitations, usedInvitation),
    });
    const committed = await this.commit(next);
    return clone(this.requireSpace(committed, space.id));
  }

  async rotateSpaceInvite(input: RotateSpaceInviteInput): Promise<SpaceInvitation> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    const memberCount = snapshot.members.filter((member) => member.spaceId === input.spaceId).length;
    if (memberCount >= 2) {
      throw new RepositoryError('space_full', 'That Kin Space already has two people.', 'reenter');
    }

    const space = this.requireSpace(snapshot, input.spaceId);
    const safety = await this.currentSafety();
    const revokedAt = this.now();
    const revoked = space.activeInvitation
      ? { ...space.activeInvitation, revokedAt, status: 'revoked' as const }
      : null;
    const invitation = this.createInvitation(space.id);
    const next = clone(snapshot);
    next.spaces = next.spaces.map((item) => item.id === space.id
      ? { ...item, activeInvitation: invitation, inviteCode: invitation.code }
      : item);
    await this.commitSafety({
      ...safety,
      invitations: [
        ...safety.invitations
          .filter((item) => item.id !== revoked?.id && item.id !== invitation.id),
        ...(revoked ? [revoked] : []),
        invitation,
      ],
    });
    await this.commit(next);
    return clone(invitation);
  }

  async revokeSpaceInvite(input: RevokeSpaceInviteInput): Promise<SpaceInvitation> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    const space = this.requireSpace(snapshot, input.spaceId);
    const invitation = space.activeInvitation;
    if (!invitation || getDemoInvitationStatus(invitation, this.now()) !== 'active') {
      throw new RepositoryError('invite_invalid', 'There is no active invitation to change.', 'retry');
    }
    const revoked: SpaceInvitation = {
      ...invitation,
      revokedAt: this.now(),
      status: 'revoked',
    };
    const safety = await this.currentSafety();
    const next = clone(snapshot);
    next.spaces = next.spaces.map((item) => item.id === space.id
      ? { ...item, activeInvitation: undefined, inviteCode: '' }
      : item);
    await this.commitSafety({
      ...safety,
      invitations: upsertInvitation(safety.invitations, revoked),
    });
    await this.commit(next);
    return clone(revoked);
  }

  async leaveSpace(input: LeaveSpaceInput): Promise<void> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    await this.commit(removeSpaces(snapshot, new Set([input.spaceId])));
  }

  async blockSpaceMember(input: BlockSpaceMemberInput): Promise<void> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    const partner = snapshot.members.find(
      (member) => member.spaceId === input.spaceId && member.userId !== currentProfile.id,
    );
    if (!partner) {
      throw new RepositoryError('not_found', 'There is no connected person to block.', 'reconnect');
    }
    const sharedSpaceIds = new Set(
      snapshot.members
        .filter((member) => member.userId === currentProfile.id)
        .map((member) => member.spaceId)
        .filter((spaceId) => snapshot.members.some(
          (member) => member.spaceId === spaceId && member.userId === partner.userId,
        )),
    );
    const safety = await this.currentSafety();
    const block = {
      blockedId: partner.userId,
      blockerId: currentProfile.id,
      createdAt: this.now(),
      spaceId: input.spaceId,
    };
    await this.commitSafety({
      ...safety,
      blocks: [
        ...safety.blocks.filter((item) => !isBlockedPair(item, currentProfile.id, partner.userId)),
        block,
      ],
    });
    await this.commit(removeSpaces(snapshot, sharedSpaceIds));
  }

  async submitContentReport(input: SubmitContentReportInput): Promise<ContentReportReceipt> {
    if (!isContentReportCategory(input.category)) {
      throw new RepositoryError('report_invalid', 'Choose a valid reason for this report.', 'reenter');
    }
    const explanation = input.explanation?.trim() ?? '';
    if (explanation.length > 2000) {
      throw new RepositoryError(
        'report_invalid',
        'Keep report details to 2,000 characters or fewer.',
        'reenter',
      );
    }
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    const message = input.messageId
      ? snapshot.messages.find(
          (item) => item.id === input.messageId && item.spaceId === input.spaceId,
        )
      : undefined;
    if (input.messageId && !message) {
      throw new RepositoryError('report_invalid', 'That report target is unavailable.', 'reenter');
    }
    const targetUserId = message?.senderId ?? snapshot.members.find(
      (member) => member.spaceId === input.spaceId && member.userId !== currentProfile.id,
    )?.userId;
    if (!targetUserId || targetUserId === currentProfile.id) {
      throw new RepositoryError('report_invalid', 'That report target is unavailable.', 'reenter');
    }
    const createdAt = this.now();
    const id = this.makeId('report');
    const safety = await this.currentSafety();
    await this.commitSafety({
      ...safety,
      reports: [...safety.reports, {
        category: input.category,
        createdAt,
        explanation,
        id,
        ...(input.messageId ? { messageId: input.messageId } : {}),
        reportedUserId: targetUserId,
        reporterId: currentProfile.id,
        spaceId: input.spaceId,
      }],
    });
    return { createdAt, id, status: 'submitted' };
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, input.spaceId, currentProfile.id);
    const body = input.body.trim();
    if (!body && !input.mediaUri) {
      throw new RepositoryError('message_invalid', 'Write a message or choose something to send.');
    }
    if (
      input.kind === 'image'
      && (
        !input.mediaUri
        || !input.mediaMimeType
        || !MESSAGE_IMAGE_MIME_TYPES.includes(input.mediaMimeType)
        || input.mediaByteSize === undefined
        || !Number.isFinite(input.mediaByteSize)
        || input.mediaByteSize < 1
        || input.mediaByteSize > MAX_MESSAGE_IMAGE_BYTES
      )
    ) {
      throw new RepositoryError(
        'message_invalid',
        'Choose a processed JPEG, PNG, or WebP image that is 10 MB or smaller.',
        'reenter',
      );
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

  async removeFailedMessage(messageId: Id): Promise<void> {
    const snapshot = await this.current();
    const message = this.requireMessage(snapshot, messageId);
    if (message.deliveryState !== 'failed') return;
    const next = clone(snapshot);
    next.messages = next.messages.filter((item) => item.id !== messageId);
    await this.commit(next);
  }

  async loadOlderMessages(spaceId: Id): Promise<Message[]> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, spaceId, currentProfile.id);
    return [];
  }

  async markSpaceRead(spaceId: Id): Promise<void> {
    const snapshot = await this.current();
    const currentProfile = this.requireCurrentProfile(snapshot);
    this.requireMembership(snapshot, spaceId, currentProfile.id);
    await this.commit({
      ...snapshot,
      unreadCounts: { ...snapshot.unreadCounts, [spaceId]: 0 },
    });
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
    const sourceMessageIds = [...new Set(input.sourceMessageIds)].sort();
    if (sourceMessageIds.some((messageId) =>
      !snapshot.messages.some((message) => message.id === messageId && message.spaceId === input.spaceId))) {
      throw new RepositoryError('save_failed', 'Kin could not keep that source message.', 'reenter');
    }
    const memory = createMemoryItem({
      ...input,
      id: input.clientMemoryId,
      createdBy: currentProfile.id,
      sourceMessageIds,
      now: this.now(),
    });
    const existing = snapshot.memories.find((item) => item.id === input.clientMemoryId);
    if (existing) {
      if (sameMemoryDraft(existing, memory)) return clone(existing);
      throw new RepositoryError(
        'save_failed',
        'Kin could not keep that memory because this draft ID was already used.',
        'reenter',
      );
    }
    const ownedCount = snapshot.memories.filter(
      (item) => item.spaceId === input.spaceId && item.createdBy === currentProfile.id,
    ).length;
    if (!input.isKinPlusHint && ownedCount >= FREE_MEMORY_LIMIT) {
      throw new RepositoryError(
        'memory_limit',
        'Kin+ unlocks unlimited new Moments.',
      );
    }
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
    next.unreadCounts = {
      ...next.unreadCounts,
      [sent.spaceId]: (next.unreadCounts[sent.spaceId] ?? 0) + 1,
    };
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

  private createInvitation(spaceId: Id): SpaceInvitation {
    const createdAt = this.now();
    return {
      code: this.makeInviteCode().trim().toUpperCase(),
      createdAt,
      expiresAt: addDays(createdAt, 7),
      id: this.makeId('invitation'),
      maxUses: 1,
      spaceId,
      status: 'active',
      useCount: 0,
    };
  }

  private async currentSafety(): Promise<DemoSafetyState> {
    if (this.safety) return clone(this.safety);
    const stored = await this.storage.getItem(SAFETY_STORAGE_KEY);
    if (stored === null) {
      this.safety = createEmptySafetyState();
      return clone(this.safety);
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      // Some test or embedding adapters intentionally model storage as one slot. A snapshot
      // returned for the safety key means the safety record has never been persisted.
      if (isSnapshot(parsed)) {
        this.safety = createEmptySafetyState();
        return clone(this.safety);
      }
      if (!isSafetyState(parsed)) throw new Error('Unsupported Kin safety state');
      this.safety = parsed;
      return clone(this.safety);
    } catch {
      throw new RepositoryError(
        'demo_snapshot_corrupt',
        'Kin could not read the saved demo safety state. Reset it to start safely.',
        'reset',
      );
    }
  }

  private async commitSafety(state: DemoSafetyState): Promise<void> {
    const canonical = clone(state);
    await this.storage.setItem(SAFETY_STORAGE_KEY, JSON.stringify(canonical));
    this.safety = canonical;
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
    const canonical = normalizeDemoMessagePages(clone(snapshot));
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

function sameMemoryDraft(left: MemoryItem, right: MemoryItem): boolean {
  return left.spaceId === right.spaceId
    && left.createdBy === right.createdBy
    && left.kind === right.kind
    && left.visibility === right.visibility
    && left.title === right.title
    && left.occurredOn === right.occurredOn
    && left.note === right.note
    && left.place === right.place
    && JSON.stringify(left.sourceMessageIds) === JSON.stringify(right.sourceMessageIds)
    && JSON.stringify(left.mediaUris) === JSON.stringify(right.mediaUris);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function createEmptySafetyState(): DemoSafetyState {
  return { blocks: [], invitations: [], reports: [], version: 1 };
}

function getDemoInvitationStatus(
  invitation: SpaceInvitation,
  now: string,
): SpaceInvitation['status'] {
  if (invitation.revokedAt || invitation.status === 'revoked') return 'revoked';
  if (invitation.redeemedBy || invitation.useCount >= invitation.maxUses || invitation.status === 'used') {
    return 'used';
  }
  if (invitation.expiresAt <= now) return 'expired';
  return 'active';
}

function refreshDemoInvitationStatuses(snapshot: KinSnapshot, now: string): KinSnapshot {
  const next = clone(snapshot);
  next.spaces = next.spaces.map((space) => {
    if (!space.activeInvitation) return space;
    const status = getDemoInvitationStatus(space.activeInvitation, now);
    if (status === space.activeInvitation.status) return space;
    return {
      ...space,
      activeInvitation: { ...space.activeInvitation, status },
    };
  });
  return next;
}

function normalizeDemoMessagePages(snapshot: KinSnapshot): KinSnapshot {
  const existingPages = snapshot.messagePages ?? {};
  const existingUnreadCounts = snapshot.unreadCounts ?? {};
  const messagePages: KinSnapshot['messagePages'] = {};
  const unreadCounts: KinSnapshot['unreadCounts'] = {};
  for (const space of snapshot.spaces) {
    const messages = snapshot.messages
      .filter((message) => message.spaceId === space.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const oldest = messages[0];
    messagePages[space.id] = {
      hasOlderMessages: existingPages[space.id]?.hasOlderMessages ?? false,
      loadedCount: messages.length,
      ...(oldest ? {
        oldestCreatedAt: oldest.createdAt,
        oldestMessageId: oldest.id,
      } : {}),
    };
    unreadCounts[space.id] = Math.max(0, existingUnreadCounts[space.id] ?? 0);
  }
  return { ...snapshot, messagePages, unreadCounts };
}

function isBlockedPair(
  block: DemoSafetyState['blocks'][number],
  firstUserId: Id,
  secondUserId: Id,
): boolean {
  return (block.blockerId === firstUserId && block.blockedId === secondUserId)
    || (block.blockerId === secondUserId && block.blockedId === firstUserId);
}

function upsertInvitation(
  invitations: readonly SpaceInvitation[],
  invitation: SpaceInvitation,
): SpaceInvitation[] {
  return [
    ...invitations.filter((item) => item.id !== invitation.id),
    invitation,
  ];
}

function removeSpaces(snapshot: KinSnapshot, spaceIds: ReadonlySet<Id>): KinSnapshot {
  const next = clone(snapshot);
  next.spaces = next.spaces.filter((space) => !spaceIds.has(space.id));
  next.members = next.members.filter((member) => !spaceIds.has(member.spaceId));
  next.messages = next.messages.filter((message) => !spaceIds.has(message.spaceId));
  next.messagePages = Object.fromEntries(
    Object.entries(next.messagePages).filter(([spaceId]) => !spaceIds.has(spaceId)),
  );
  next.unreadCounts = Object.fromEntries(
    Object.entries(next.unreadCounts).filter(([spaceId]) => !spaceIds.has(spaceId)),
  );
  next.memories = next.memories.filter((memory) => !spaceIds.has(memory.spaceId));
  return next;
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

function isSafetyState(value: unknown): value is DemoSafetyState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DemoSafetyState>;
  return candidate.version === 1
    && Array.isArray(candidate.blocks)
    && Array.isArray(candidate.invitations)
    && Array.isArray(candidate.reports);
}
