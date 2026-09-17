import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { createMemoryItem } from '@/domain/commands';
import {
  isContentReportCategory,
  type ContentReportReceipt,
  type Id,
  type KinSnapshot,
  type KinSpace,
  type MemoryItem,
  type Message,
  type MessagePageState,
  type SpaceInvitation,
  type UserProfile,
} from '@/domain/models';
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
  SubmitContentReportInput,
  UpdateMemoryInput,
  UpdateSpacePreferencesInput,
} from '../contracts';
import { RepositoryError, type RepositoryErrorCode } from '../errors';
import type { Database } from './database.types';
import { deleteKinMedia, resolveKinMedia, uploadKinMedia } from './media';
import { requireAuthenticatedUserId } from './requireAuthenticatedUser';
import {
  mapMember,
  mapMemory,
  mapMessage,
  mapProfile,
  mapSpace,
  mapInvitation,
  type InviteRow,
  type MemberRow,
  type MemoryMessageRow,
  type MemoryRow,
  type MessageRow,
  type ProfileRow,
  type ReactionRow,
  type SpaceRow,
  type ThemeRow,
} from './mappers';

export function createSupabaseKinRepository(client: SupabaseClient<Database>): KinRepository {
  return new SupabaseKinRepository(client);
}

class SupabaseKinRepository implements KinRepository {
  readonly mode = 'connected' as const;
  private snapshot: KinSnapshot | null = null;
  private readonly listeners = new Set<(snapshot: KinSnapshot) => void>();
  private channel: RealtimeChannel | null = null;
  private realtimeSpaceKey = '';
  private refreshing = false;
  private readonly messageMediaReferences = new Map<Id, string>();

  constructor(private readonly client: SupabaseClient<Database>) {}

  async load(): Promise<KinSnapshot> {
    const userId = await this.ensureUserId();
    const ownProfileResult = await this.client.from('profiles').select('*').eq('id', userId);
    assertResult(ownProfileResult.error, 'load_failed', 'Kin could not load your profile.', 'reconnect');
    const ownProfileRows = (ownProfileResult.data ?? []) as ProfileRow[];

    const membershipResult = await this.client.from('kin_space_members').select('*').eq('user_id', userId).is('left_at', null);
    assertResult(membershipResult.error, 'load_failed', 'Kin could not load your Spaces.', 'reconnect');
    const ownMemberships = (membershipResult.data ?? []) as MemberRow[];
    const spaceIds = ownMemberships.map((item) => item.space_id);

    if (spaceIds.length === 0) {
      this.snapshot = {
        currentUserId: userId,
        members: [],
        memories: [],
        messages: [],
        messagePages: {},
        unreadCounts: {},
        profiles: ownProfileRows.map(mapProfile),
        schemaVersion: 1,
        spaces: [],
      };
      this.ensureRealtime();
      return clone(this.snapshot);
    }

    const [spacesResult, membersResult, themesResult, memoriesResult, invitesResult] =
      await Promise.all([
        this.client.from('kin_spaces').select('*').in('id', spaceIds),
        this.client.from('kin_space_members').select('*').in('space_id', spaceIds).is('left_at', null),
        this.client.from('space_themes').select('*').in('space_id', spaceIds),
        this.client.from('memory_items').select('*').in('space_id', spaceIds).order('occurred_on'),
        this.client.from('space_invites').select('*').in('space_id', spaceIds).order('created_at', { ascending: false }),
      ]);
    for (const result of [spacesResult, membersResult, themesResult, memoriesResult, invitesResult]) {
      assertResult(result.error, 'load_failed', 'Kin could not finish loading this relationship.', 'reconnect');
    }

    const [messagePageResults, unreadResult] = await Promise.all([
      Promise.all(spaceIds.map(async (spaceId) => ({
        result: await this.client.rpc('list_space_messages', {
          before_created_at: null,
          before_message_id: null,
          page_size: 51,
          target_space_id: spaceId,
        }),
        spaceId,
      }))),
      this.client.rpc('get_my_unread_counts', {}),
    ]);
    for (const { result } of messagePageResults) {
      assertResult(result.error, 'load_failed', 'Kin could not load recent messages.', 'reconnect');
    }
    assertResult(unreadResult.error, 'load_failed', 'Kin could not load unread messages.', 'reconnect');

    const spaces = (spacesResult.data ?? []) as SpaceRow[];
    const members = (membersResult.data ?? []) as MemberRow[];
    const themes = (themesResult.data ?? []) as ThemeRow[];
    const newestRowsBySpace = new Map<Id, MessageRow[]>();
    const freshMessagePages: Record<Id, MessagePageState> = {};
    const unreadCounts = Object.fromEntries(
      (unreadResult.data ?? []).map((row) => [row.space_id, Number(row.unread_count)]),
    );
    for (const { result, spaceId } of messagePageResults) {
      const probedRows = (result.data ?? []) as MessageRow[];
      const visibleRows = probedRows.slice(0, 50);
      newestRowsBySpace.set(spaceId, visibleRows);
      freshMessagePages[spaceId] = pageStateForRows(visibleRows, probedRows.length > 50);
    }
    const storedMessageRows = [...newestRowsBySpace.values()].flat();
    const storedMemoryRows = (memoriesResult.data ?? []) as MemoryRow[];
    const invites = (invitesResult.data ?? []) as InviteRow[];
    const profileIds = [...new Set(members.map((item) => item.user_id))];
    const messageIds = storedMessageRows.map((item) => item.id);
    const memoryIds = storedMemoryRows.map((item) => item.id);

    const [profilesResult, reactionsResult, linksResult] = await Promise.all([
      this.client.from('profiles').select('*').in('id', profileIds),
      messageIds.length
        ? this.client.from('message_reactions').select('*').in('message_id', messageIds)
        : Promise.resolve({ data: [], error: null }),
      memoryIds.length
        ? this.client.from('memory_item_messages').select('*').in('memory_id', memoryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [profilesResult, reactionsResult, linksResult]) {
      assertResult(result.error, 'load_failed', 'Kin could not load relationship details.', 'reconnect');
    }
    const profiles = (profilesResult.data ?? []) as ProfileRow[];
    const reactions = (reactionsResult.data ?? []) as ReactionRow[];
    const links = (linksResult.data ?? []) as MemoryMessageRow[];
    let messages: Message[];
    let memoryRows: MemoryRow[];
    try {
      [messages, memoryRows] = await Promise.all([
        this.hydrateMessageRows(storedMessageRows, reactions),
        Promise.all(storedMemoryRows.map(async (row) => ({
          ...row,
          media_uris: await Promise.all(row.media_uris.map((uri) => resolveKinMedia(this.client, uri))),
        }))),
      ]);
    } catch {
      throw new RepositoryError(
        'load_failed',
        'Kin could not open private media. Try reconnecting.',
        'reconnect',
      );
    }

    const previous = this.snapshot;
    const activeSpaceIds = new Set(spaceIds);
    const preservedMessages = previous?.messages.filter((message) => activeSpaceIds.has(message.spaceId)) ?? [];
    const mergedMessages = mergeMessages(preservedMessages, messages);
    const messagePages = { ...freshMessagePages };
    for (const spaceId of spaceIds) {
      const previousPage = previous?.messagePages[spaceId];
      if (previousPage && previousPage.loadedCount > 50) {
        messagePages[spaceId] = {
          ...previousPage,
          loadedCount: mergedMessages.filter((message) => message.spaceId === spaceId).length,
        };
      } else {
        messagePages[spaceId] = {
          ...messagePages[spaceId],
          loadedCount: mergedMessages.filter((message) => message.spaceId === spaceId).length,
        };
      }
    }

    this.snapshot = {
      currentUserId: userId,
      members: members.map(mapMember),
      memories: memoryRows.map((row) => mapMemory(row, links)),
      messages: mergedMessages,
      messagePages,
      profiles: profiles.map(mapProfile),
      schemaVersion: 1,
      spaces: spaces.map((row) => mapSpace(row, members, themes, invites)),
      unreadCounts,
    };
    this.ensureRealtime();
    return clone(this.snapshot);
  }

  subscribe(listener: (snapshot: KinSnapshot) => void): () => void {
    this.listeners.add(listener);
    this.ensureRealtime();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.channel) {
        void this.client.removeChannel(this.channel);
        this.channel = null;
        this.realtimeSpaceKey = '';
      }
    };
  }

  async resetDemo(): Promise<KinSnapshot> {
    throw new RepositoryError('unavailable', 'Demo reset is available only in local demo mode.');
  }

  async saveProfile(input: SaveProfileInput): Promise<UserProfile> {
    const displayName = input.displayName.trim();
    if (!displayName) throw new RepositoryError('profile_required', 'Tell Kin what to call you.', 'onboard');
    const id = await this.ensureUserId();
    const result = await this.client.from('profiles').upsert({
      avatar_uri: input.avatarUri,
      display_name: displayName,
      id,
    }).select().single();
    assertResult(result.error, 'save_failed', 'Kin could not save your profile.', 'retry');
    await this.refreshAndEmit();
    return mapProfile(result.data as ProfileRow);
  }

  async createSpace(input: CreateSpaceInput): Promise<KinSpace> {
    await this.ensureUserId();
    const nickname = input.otherDisplayName.trim();
    if (!nickname) throw new RepositoryError('profile_required', 'Who is this Kin Space for?', 'onboard');
    const result = await this.client.rpc('create_kin_space', {
      other_display_name: nickname,
      relationship_start_date: input.relationshipStartDate ?? null,
    });
    if (result.error || !result.data) {
      throw mapLifecycleError(result.error, 'save_failed', 'Kin could not create that Space.', 'retry');
    }
    const snapshot = await this.refreshAndEmit();
    return requireEntity(
      snapshot.spaces.find((space) => space.id === result.data),
      'Kin could not reopen the new Space.',
    );
  }

  async joinSpace(input: JoinSpaceInput): Promise<KinSpace> {
    const code = input.inviteCode.trim().toUpperCase();
    const result = await this.client.rpc('redeem_space_invite', { invite_code: code });
    if (result.error || !result.data) {
      throw mapLifecycleError(
        result.error,
        'invite_invalid',
        'That invitation could not be used.',
        'reenter',
      );
    }
    const snapshot = await this.refreshAndEmit();
    return requireEntity(snapshot.spaces.find((space) => space.id === result.data), 'Kin could not open the joined Space.');
  }

  async rotateSpaceInvite(input: RotateSpaceInviteInput): Promise<SpaceInvitation> {
    const result = await this.client.rpc('rotate_space_invite', {
      target_space_id: input.spaceId,
    });
    if (result.error || !result.data) {
      throw mapLifecycleError(
        result.error,
        'save_failed',
        'Kin could not create a new invitation.',
        'retry',
      );
    }
    const invitation = mapInvitation(firstRow(result.data));
    await this.refreshAndEmit();
    return invitation;
  }

  async revokeSpaceInvite(input: RevokeSpaceInviteInput): Promise<SpaceInvitation> {
    const result = await this.client.rpc('revoke_space_invite', {
      target_space_id: input.spaceId,
    });
    if (result.error || !result.data) {
      throw mapLifecycleError(
        result.error,
        'save_failed',
        'Kin could not revoke that invitation.',
        'retry',
      );
    }
    const invitation = mapInvitation(firstRow(result.data));
    await this.refreshAndEmit();
    return invitation;
  }

  async leaveSpace(input: LeaveSpaceInput): Promise<void> {
    const result = await this.client.rpc('leave_kin_space', {
      target_space_id: input.spaceId,
    });
    if (result.error) {
      throw mapLifecycleError(
        result.error,
        'save_failed',
        'Kin could not leave that Space.',
        'retry',
      );
    }
    await this.refreshAndEmit();
  }

  async blockSpaceMember(input: BlockSpaceMemberInput): Promise<void> {
    const result = await this.client.rpc('block_kin_space_member', {
      target_space_id: input.spaceId,
    });
    if (result.error) {
      throw mapLifecycleError(
        result.error,
        'save_failed',
        'Kin could not block that person.',
        'retry',
      );
    }
    await this.refreshAndEmit();
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
    const result = await this.client.rpc('submit_content_report', {
      report_category: input.category,
      report_explanation: explanation,
      target_message_id: input.messageId ?? null,
      target_space_id: input.spaceId,
    });
    if (result.error || !result.data) {
      throw mapLifecycleError(
        result.error,
        'save_failed',
        'Kin could not submit that report.',
        'retry',
      );
    }
    return {
      createdAt: result.data.created_at,
      id: result.data.id,
      status: 'submitted',
    };
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const snapshot = this.snapshot ?? await this.load();
    const senderId = requireEntity(snapshot.currentUserId, 'Create your profile before messaging.');
    const body = input.body.trim();
    if (!body && !input.mediaUri) throw new RepositoryError('message_invalid', 'Write a message or choose something to send.');
    const message: Message = {
      body,
      createdAt: new Date().toISOString(),
      deliveryState: 'sending',
      id: randomUuid(),
      kind: input.kind,
      ...(input.mediaUri ? { mediaUri: input.mediaUri } : {}),
      reactions: [],
      senderId,
      spaceId: input.spaceId,
    };
    this.setCachedMessage(message);
    let storedMediaUri: string | null = null;
    try {
      storedMediaUri = message.mediaUri
        ? await uploadKinMedia(this.client, {
            mediaId: message.id,
            sourceUri: message.mediaUri,
            spaceId: message.spaceId,
            userId: senderId,
          })
        : null;
      if (storedMediaUri) this.messageMediaReferences.set(message.id, storedMediaUri);
    } catch {
      const failed = { ...message, deliveryState: 'failed' as const };
      this.setCachedMessage(failed);
      return failed;
    }
    const result = await this.client.rpc('send_kin_message', {
      client_message_id: message.id,
      message_body: body,
      message_kind: message.kind,
      message_media_uri: storedMediaUri,
      target_space_id: message.spaceId,
    });
    if (result.error || !result.data) {
      const failed = { ...message, deliveryState: 'failed' as const };
      this.setCachedMessage(failed);
      return failed;
    }
    const sent = await this.hydrateSentMessage(firstRow(result.data), message);
    this.setCachedMessage(sent);
    return sent;
  }

  async retryMessage(messageId: Id): Promise<Message> {
    const snapshot = this.snapshot ?? await this.load();
    const message = requireEntity(snapshot.messages.find((item) => item.id === messageId), 'That message could not be found.');
    if (message.deliveryState !== 'failed') return message;
    this.setCachedMessage({ ...message, deliveryState: 'sending' });
    let storedMediaUri: string | null = null;
    try {
      storedMediaUri = this.messageMediaReferences.get(message.id) ?? (message.mediaUri
        ? await uploadKinMedia(this.client, {
            mediaId: message.id,
            sourceUri: message.mediaUri,
            spaceId: message.spaceId,
            userId: message.senderId,
          })
        : null);
      if (storedMediaUri) this.messageMediaReferences.set(message.id, storedMediaUri);
    } catch {
      this.setCachedMessage(message);
      return message;
    }
    const result = await this.client.rpc('send_kin_message', {
      client_message_id: message.id,
      message_body: message.body,
      message_kind: message.kind,
      message_media_uri: storedMediaUri,
      target_space_id: message.spaceId,
    });
    const updated = result.error || !result.data
      ? message
      : await this.hydrateSentMessage(firstRow(result.data), message);
    this.setCachedMessage(updated);
    return updated;
  }

  async removeFailedMessage(messageId: Id): Promise<void> {
    const snapshot = this.snapshot ?? await this.load();
    const message = requireEntity(
      snapshot.messages.find((item) => item.id === messageId),
      'That message could not be found.',
    );
    if (message.deliveryState !== 'failed') return;
    const durableReference = this.messageMediaReferences.get(message.id);
    this.snapshot = {
      ...snapshot,
      messagePages: {
        ...snapshot.messagePages,
        [message.spaceId]: {
          ...snapshot.messagePages[message.spaceId],
          loadedCount: Math.max(0, (snapshot.messagePages[message.spaceId]?.loadedCount ?? 1) - 1),
        },
      },
      messages: snapshot.messages.filter((item) => item.id !== message.id),
    };
    this.messageMediaReferences.delete(message.id);
    this.emit(this.snapshot);
    if (!durableReference || [...this.messageMediaReferences.values()].includes(durableReference)) return;
    try {
      const referenced = await this.client.from('messages').select('id').eq('media_uri', durableReference).limit(1);
      if (!referenced.error && (referenced.data ?? []).length === 0) {
        await deleteKinMedia(this.client, durableReference);
      }
    } catch {
      // Removing a failed local bubble must remain available even if best-effort cleanup is offline.
    }
  }

  async loadOlderMessages(spaceId: Id): Promise<Message[]> {
    const snapshot = this.snapshot ?? await this.load();
    const page = snapshot.messagePages[spaceId];
    if (!page?.hasOlderMessages || !page.oldestCreatedAt || !page.oldestMessageId) return [];
    const result = await this.client.rpc('list_space_messages', {
      before_created_at: page.oldestCreatedAt,
      before_message_id: page.oldestMessageId,
      page_size: 51,
      target_space_id: spaceId,
    });
    assertResult(result.error, 'load_failed', 'Kin could not load older messages.', 'retry');
    const probedRows = ((result.data ?? []) as MessageRow[]);
    const visibleRows = probedRows.slice(0, 50);
    const messageIds = visibleRows.map((row) => row.id);
    const reactionsResult = messageIds.length
      ? await this.client.from('message_reactions').select('*').in('message_id', messageIds)
      : { data: [], error: null };
    assertResult(reactionsResult.error, 'load_failed', 'Kin could not load older reactions.', 'retry');
    let messages: Message[];
    try {
      messages = await this.hydrateMessageRows(
        visibleRows,
        (reactionsResult.data ?? []) as ReactionRow[],
      );
    } catch {
      throw new RepositoryError(
        'load_failed',
        'Kin could not open older private media. Try again.',
        'retry',
      );
    }
    const merged = mergeMessages(snapshot.messages, messages);
    this.snapshot = {
      ...snapshot,
      messagePages: {
        ...snapshot.messagePages,
        [spaceId]: {
          ...pageStateForRows(visibleRows, probedRows.length > 50),
          loadedCount: merged.filter((message) => message.spaceId === spaceId).length,
        },
      },
      messages: merged,
    };
    this.emit(this.snapshot);
    return clone(messages);
  }

  async markSpaceRead(spaceId: Id): Promise<void> {
    const result = await this.client.rpc('mark_space_read', { target_space_id: spaceId });
    if (result.error) {
      throw mapLifecycleError(result.error, 'save_failed', 'Kin could not mark that Space read.', 'retry');
    }
    if (this.snapshot) {
      this.snapshot = {
        ...this.snapshot,
        unreadCounts: { ...this.snapshot.unreadCounts, [spaceId]: 0 },
      };
      this.emit(this.snapshot);
    }
  }

  async addReaction(input: AddReactionInput): Promise<Message> {
    const userId = await this.ensureUserId();
    const existing = await this.client.from('message_reactions').select('*').eq('message_id', input.messageId).eq('user_id', userId).eq('emoji', input.emoji).maybeSingle();
    assertResult(existing.error, 'save_failed', 'Kin could not update that reaction.', 'retry');
    const result = existing.data
      ? await this.client.from('message_reactions').delete().eq('message_id', input.messageId).eq('user_id', userId).eq('emoji', input.emoji)
      : await this.client.from('message_reactions').insert({ emoji: input.emoji, message_id: input.messageId, user_id: userId });
    assertResult(result.error, 'save_failed', 'Kin could not update that reaction.', 'retry');
    const snapshot = await this.refreshAndEmit();
    return requireEntity(snapshot.messages.find((item) => item.id === input.messageId), 'That message could not be found.');
  }

  async updateSpacePreferences(input: UpdateSpacePreferencesInput): Promise<KinSpace> {
    const result = await this.client.from('space_themes').upsert({
      nickname: input.nickname.trim(),
      space_id: input.spaceId,
      theme_id: input.themeId,
      user_id: input.userId,
      wallpaper_id: input.wallpaperId,
    });
    assertResult(result.error, 'save_failed', 'Kin could not save those relationship settings.', 'retry');
    const snapshot = await this.refreshAndEmit();
    return requireEntity(snapshot.spaces.find((space) => space.id === input.spaceId), 'That Space could not be found.');
  }

  async saveMemory(input: SaveMemoryInput): Promise<MemoryItem> {
    const createdBy = await this.ensureUserId();
    const now = new Date().toISOString();
    const memory = createMemoryItem({ ...input, createdBy, id: randomUuid(), now });
    let storedMediaUris: string[];
    try {
      storedMediaUris = await Promise.all(memory.mediaUris.map((sourceUri, index) =>
        uploadKinMedia(this.client, {
          mediaId: `${memory.id}-${index}`,
          sourceUri,
          spaceId: memory.spaceId,
          userId: createdBy,
        })));
    } catch {
      throw new RepositoryError('save_failed', 'Kin could not upload that memory.', 'retry');
    }
    const result = await this.client.from('memory_items').insert({
      ...toMemoryRow(memory),
      media_uris: storedMediaUris,
    });
    assertResult(result.error, 'save_failed', 'Kin could not keep that yet.', 'retry');
    if (memory.sourceMessageIds.length) {
      const linkResult = await this.client.from('memory_item_messages').insert(
        memory.sourceMessageIds.map((messageId) => ({ memory_id: memory.id, message_id: messageId })),
      );
      if (linkResult.error) {
        await this.client.from('memory_items').delete().eq('id', memory.id);
        throw new RepositoryError('save_failed', 'Kin could not keep the source with that item.', 'retry');
      }
    }
    await this.refreshAndEmit();
    return memory;
  }

  async updateMemory(input: UpdateMemoryInput): Promise<MemoryItem> {
    const result = await this.client.from('memory_items').update({
      note: input.note?.trim(),
      occurred_on: input.occurredOn,
      place: input.place?.trim() || null,
      title: input.title.trim(),
      updated_at: new Date().toISOString(),
      visibility: input.visibility,
    }).eq('id', input.memoryId).select().single();
    assertResult(result.error, 'save_failed', 'Kin could not update that saved item.', 'retry');
    const snapshot = await this.refreshAndEmit();
    return requireEntity(snapshot.memories.find((memory) => memory.id === input.memoryId), 'That saved item could not be found.');
  }

  async deleteMemory(memoryId: Id): Promise<void> {
    const result = await this.client.from('memory_items').delete().eq('id', memoryId);
    assertResult(result.error, 'save_failed', 'Kin could not delete that saved item.', 'retry');
    await this.refreshAndEmit();
  }

  async archiveSpace(spaceId: Id, userId: Id, archived: boolean): Promise<void> {
    const result = await this.client.from('kin_space_members').update({ archived }).eq('space_id', spaceId).eq('user_id', userId);
    assertResult(result.error, 'save_failed', 'Kin could not update that archive.', 'retry');
    await this.refreshAndEmit();
  }

  async deleteLocalSpace(): Promise<void> {
    throw new RepositoryError('unavailable', 'Local-copy deletion applies only to demo data. Archive this connected Space instead.');
  }

  private async hydrateMessageRows(
    rows: readonly MessageRow[],
    reactions: readonly ReactionRow[],
  ): Promise<Message[]> {
    return Promise.all(rows.map(async (row) => {
      const previousReference = this.messageMediaReferences.get(row.id);
      const cached = this.snapshot?.messages.find((message) => message.id === row.id);
      if (row.media_uri) this.messageMediaReferences.set(row.id, row.media_uri);
      const mapped = mapMessage(row, reactions);
      if (!row.media_uri) return mapped;
      if (cached?.mediaUri && previousReference === row.media_uri) {
        return { ...mapped, mediaUri: cached.mediaUri };
      }
      return { ...mapped, mediaUri: await resolveKinMedia(this.client, row.media_uri) };
    }));
  }

  private async hydrateSentMessage(row: MessageRow, optimistic: Message): Promise<Message> {
    if (row.media_uri) this.messageMediaReferences.set(row.id, row.media_uri);
    try {
      const [message] = await this.hydrateMessageRows([row], []);
      return requireEntity(message, 'Kin received an empty message result.');
    } catch {
      return {
        ...mapMessage(row, []),
        ...(optimistic.mediaUri ? { mediaUri: optimistic.mediaUri } : {}),
      };
    }
  }

  private async ensureUserId(): Promise<string> {
    return requireAuthenticatedUserId(this.client.auth);
  }

  private setCachedMessage(message: Message) {
    if (!this.snapshot) return;
    const exists = this.snapshot.messages.some((item) => item.id === message.id);
    const currentPage = this.snapshot.messagePages[message.spaceId] ?? {
      hasOlderMessages: false,
      loadedCount: 0,
    };
    this.snapshot = {
      ...this.snapshot,
      messagePages: {
        ...this.snapshot.messagePages,
        [message.spaceId]: {
          ...currentPage,
          loadedCount: currentPage.loadedCount + (exists ? 0 : 1),
        },
      },
      messages: exists
        ? this.snapshot.messages.map((item) => item.id === message.id ? message : item)
        : [...this.snapshot.messages, message],
    };
    this.emit(this.snapshot);
  }

  private async refreshAndEmit(): Promise<KinSnapshot> {
    const snapshot = await this.load();
    this.emit(snapshot);
    return snapshot;
  }

  private emit(snapshot: KinSnapshot) {
    for (const listener of this.listeners) listener(clone(snapshot));
  }

  private ensureRealtime() {
    const spaceIds = this.snapshot?.spaces.map((space) => space.id).sort() ?? [];
    const spaceKey = spaceIds.join(',');
    if (this.channel && this.realtimeSpaceKey === spaceKey) return;
    if (this.channel) {
      void this.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.realtimeSpaceKey = spaceKey;
    if (spaceIds.length === 0) return;
    const spaceFilter = `space_id=in.(${spaceKey})`;
    const idFilter = `id=in.(${spaceKey})`;
    this.channel = this.client
      .channel(`kin-member-updates-${spaceIds.length}`)
      .on('postgres_changes', { event: '*', filter: spaceFilter, schema: 'public', table: 'kin_space_members' }, () => { void this.refreshFromRealtime(); })
      .on('postgres_changes', { event: '*', filter: idFilter, schema: 'public', table: 'kin_spaces' }, () => { void this.refreshFromRealtime(); })
      .on('postgres_changes', { event: '*', filter: spaceFilter, schema: 'public', table: 'space_invites' }, () => { void this.refreshFromRealtime(); })
      .on('postgres_changes', { event: '*', filter: spaceFilter, schema: 'public', table: 'messages' }, () => { void this.refreshFromRealtime(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => { void this.refreshFromRealtime(); })
      .on('postgres_changes', { event: '*', filter: spaceFilter, schema: 'public', table: 'memory_items' }, () => { void this.refreshFromRealtime(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_item_messages' }, () => { void this.refreshFromRealtime(); })
      .on('postgres_changes', { event: '*', filter: spaceFilter, schema: 'public', table: 'space_themes' }, () => { void this.refreshFromRealtime(); })
      .subscribe();
  }

  private async refreshFromRealtime() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.refreshAndEmit();
    } catch {
      // Existing data stays available; the next realtime event or screen reload can recover.
    } finally {
      this.refreshing = false;
    }
  }
}

function toMemoryRow(memory: MemoryItem) {
  return {
    created_at: memory.createdAt,
    created_by: memory.createdBy,
    id: memory.id,
    kind: memory.kind,
    media_uris: memory.mediaUris,
    note: memory.note,
    occurred_on: memory.occurredOn,
    place: memory.place ?? null,
    space_id: memory.spaceId,
    title: memory.title,
    updated_at: memory.updatedAt,
    visibility: memory.visibility,
  };
}

function pageStateForRows(
  rows: readonly MessageRow[],
  hasOlderMessages: boolean,
): MessagePageState {
  const oldest = rows.at(-1);
  return {
    hasOlderMessages,
    loadedCount: rows.length,
    ...(oldest ? {
      oldestCreatedAt: oldest.created_at,
      oldestMessageId: oldest.id,
    } : {}),
  };
}

function mergeMessages(
  existing: readonly Message[],
  incoming: readonly Message[],
): Message[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()];
}

function assertResult(
  error: { message: string } | null,
  code: RepositoryErrorCode,
  message: string,
  action?: 'retry' | 'reset' | 'reenter' | 'onboard' | 'reconnect',
): asserts error is null {
  if (error) throw new RepositoryError(code, message, action);
}

function requireEntity<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new RepositoryError('not_found', message);
  return value;
}

function firstRow<T>(value: T | T[]): T {
  return Array.isArray(value) ? requireEntity(value[0], 'Kin received an empty result.') : value;
}

function mapLifecycleError(
  error: unknown,
  fallbackCode: RepositoryErrorCode,
  fallbackMessage: string,
  fallbackRecovery?: RepositoryError['recovery'],
): RepositoryError {
  const text = lifecycleErrorText(error);
  const match = LIFECYCLE_ERRORS.find(([machineCode]) => text.includes(machineCode));
  if (!match) return new RepositoryError(fallbackCode, fallbackMessage, fallbackRecovery);
  const [, code, message, recovery] = match;
  return new RepositoryError(code, message, recovery);
}

function lifecycleErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const candidate = error as Record<string, unknown>;
  return ['code', 'message', 'details', 'hint']
    .map((key) => candidate[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

const LIFECYCLE_ERRORS: readonly [
  machineCode: string,
  code: RepositoryErrorCode,
  message: string,
  recovery?: RepositoryError['recovery'],
][] = [
  ['KIN_INVITE_EXPIRED', 'invite_expired', 'That invitation has expired.', 'reenter'],
  ['KIN_INVITE_REVOKED', 'invite_revoked', 'That invitation was revoked.', 'reenter'],
  ['KIN_INVITE_USED', 'invite_used', 'That invitation has already been used.', 'reenter'],
  ['KIN_INVITE_SELF', 'invite_self', 'You cannot join your own invitation.', 'reenter'],
  ['KIN_INVITE_BLOCKED', 'blocked', 'This connection is unavailable.', 'reenter'],
  ['KIN_SPACE_FULL', 'space_full', 'That Kin Space already has two people.', 'reenter'],
  ['KIN_ALREADY_MEMBER', 'already_member', 'You already belong to that Kin Space.', 'reenter'],
  ['KIN_INVITE_INVALID', 'invite_invalid', 'That invitation could not be found.', 'reenter'],
  ['KIN_INVITE_UNAVAILABLE', 'invite_invalid', 'There is no active invitation to change.', 'retry'],
  ['KIN_SPACE_UNAVAILABLE', 'not_found', 'That Kin Space is no longer available.', 'reconnect'],
  ['KIN_BLOCK_TARGET_UNAVAILABLE', 'not_found', 'There is no connected person to block.', 'reconnect'],
  ['KIN_REPORT_CATEGORY_INVALID', 'report_invalid', 'Choose a valid reason for this report.', 'reenter'],
  ['KIN_REPORT_EXPLANATION_TOO_LONG', 'report_invalid', 'Keep report details to 2,000 characters or fewer.', 'reenter'],
  ['KIN_REPORT_TARGET_INVALID', 'report_invalid', 'That report target is unavailable.', 'reenter'],
  ['KIN_PROFILE_REQUIRED', 'profile_required', 'Finish your profile before continuing.', 'onboard'],
  ['KIN_AUTH_REQUIRED', 'auth_required', 'Sign in to continue.', 'reconnect'],
];

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
