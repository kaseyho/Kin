import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

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
  UpdateMemoryInput,
  UpdateSpacePreferencesInput,
} from '../contracts';
import { RepositoryError, type RepositoryErrorCode } from '../errors';
import type { Database } from './database.types';
import { resolveKinMedia, uploadKinMedia } from './media';
import {
  mapMember,
  mapMemory,
  mapMessage,
  mapProfile,
  mapSpace,
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

  constructor(private readonly client: SupabaseClient<Database>) {}

  async load(): Promise<KinSnapshot> {
    const userId = await this.ensureUserId();
    const ownProfileResult = await this.client.from('profiles').select('*').eq('id', userId);
    assertResult(ownProfileResult.error, 'load_failed', 'Kin could not load your profile.', 'reconnect');
    const ownProfileRows = (ownProfileResult.data ?? []) as ProfileRow[];

    const membershipResult = await this.client.from('kin_space_members').select('*').eq('user_id', userId);
    assertResult(membershipResult.error, 'load_failed', 'Kin could not load your Spaces.', 'reconnect');
    const ownMemberships = (membershipResult.data ?? []) as MemberRow[];
    const spaceIds = ownMemberships.map((item) => item.space_id);

    if (spaceIds.length === 0) {
      this.snapshot = {
        currentUserId: userId,
        members: [],
        memories: [],
        messages: [],
        profiles: ownProfileRows.map(mapProfile),
        schemaVersion: 1,
        spaces: [],
      };
      this.ensureRealtime();
      return clone(this.snapshot);
    }

    const [spacesResult, membersResult, themesResult, messagesResult, memoriesResult, invitesResult] =
      await Promise.all([
        this.client.from('kin_spaces').select('*').in('id', spaceIds),
        this.client.from('kin_space_members').select('*').in('space_id', spaceIds),
        this.client.from('space_themes').select('*').in('space_id', spaceIds),
        this.client.from('messages').select('*').in('space_id', spaceIds).order('created_at'),
        this.client.from('memory_items').select('*').in('space_id', spaceIds).order('occurred_on'),
        this.client.from('space_invites').select('space_id,code').in('space_id', spaceIds).order('created_at', { ascending: false }),
      ]);
    for (const result of [spacesResult, membersResult, themesResult, messagesResult, memoriesResult, invitesResult]) {
      assertResult(result.error, 'load_failed', 'Kin could not finish loading this relationship.', 'reconnect');
    }

    const spaces = (spacesResult.data ?? []) as SpaceRow[];
    const members = (membersResult.data ?? []) as MemberRow[];
    const themes = (themesResult.data ?? []) as ThemeRow[];
    const storedMessageRows = (messagesResult.data ?? []) as MessageRow[];
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
    let messageRows: MessageRow[];
    let memoryRows: MemoryRow[];
    try {
      [messageRows, memoryRows] = await Promise.all([
        Promise.all(storedMessageRows.map(async (row) => ({
          ...row,
          media_uri: row.media_uri ? await resolveKinMedia(this.client, row.media_uri) : null,
        }))),
        Promise.all(storedMemoryRows.map(async (row) => ({
          ...row,
          media_uris: await Promise.all(row.media_uris.map((uri) => resolveKinMedia(this.client, uri))),
        }))),
      ]);
    } catch (error) {
      throw new RepositoryError(
        'load_failed',
        `Kin could not open private media. ${errorMessage(error)}`,
        'reconnect',
      );
    }

    this.snapshot = {
      currentUserId: userId,
      members: members.map(mapMember),
      memories: memoryRows.map((row) => mapMemory(row, links)),
      messages: messageRows.map((row) => mapMessage(row, reactions)),
      profiles: profiles.map(mapProfile),
      schemaVersion: 1,
      spaces: spaces.map((row) => mapSpace(row, members, themes, invites)),
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
    const userId = await this.ensureUserId();
    const nickname = input.otherDisplayName.trim();
    if (!nickname) throw new RepositoryError('profile_required', 'Who is this Kin Space for?', 'onboard');
    const id = randomUuid();
    const createdAt = new Date().toISOString();
    const inviteCode = makeInviteCode();
    const spaceResult = await this.client.from('kin_spaces').insert({
      created_at: createdAt,
      created_by: userId,
      id,
      relationship_start_date: input.relationshipStartDate ?? null,
    });
    assertResult(spaceResult.error, 'save_failed', 'Kin could not create that Space.', 'retry');
    const membershipResult = await this.client.from('kin_space_members').insert({
      archived: false,
      joined_at: createdAt,
      role: 'owner',
      space_id: id,
      user_id: userId,
    });
    assertResult(membershipResult.error, 'save_failed', 'Kin could not finish creating that Space.', 'retry');
    const [themeResult, inviteResult] = await Promise.all([
      this.client.from('space_themes').insert({ nickname, space_id: id, theme_id: 'kin', user_id: userId, wallpaper_id: 'paper' }),
      this.client.from('space_invites').insert({ code: inviteCode, created_by: userId, space_id: id }),
    ]);
    assertResult(themeResult.error ?? inviteResult.error, 'save_failed', 'Kin could not prepare that invitation.', 'retry');
    const snapshot = await this.refreshAndEmit();
    return requireEntity(snapshot.spaces.find((space) => space.id === id), 'Kin could not reopen the new Space.');
  }

  async joinSpace(input: JoinSpaceInput): Promise<KinSpace> {
    const code = input.inviteCode.trim().toUpperCase();
    const result = await this.client.rpc('redeem_space_invite', { invite_code: code });
    if (result.error || !result.data) {
      throw new RepositoryError('invite_invalid', 'That invitation is invalid, expired, or already used.', 'reenter');
    }
    const userId = await this.ensureUserId();
    await this.client.from('space_themes').upsert({ nickname: 'Your person', space_id: result.data, theme_id: 'kin', user_id: userId, wallpaper_id: 'paper' });
    const snapshot = await this.refreshAndEmit();
    return requireEntity(snapshot.spaces.find((space) => space.id === result.data), 'Kin could not open the joined Space.');
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
    } catch {
      const failed = { ...message, deliveryState: 'failed' as const };
      this.setCachedMessage(failed);
      return failed;
    }
    const result = await this.client.from('messages').insert({
      body,
      created_at: message.createdAt,
      id: message.id,
      kind: message.kind,
      media_uri: storedMediaUri,
      sender_id: senderId,
      space_id: message.spaceId,
    });
    if (result.error) {
      const failed = { ...message, deliveryState: 'failed' as const };
      this.setCachedMessage(failed);
      return failed;
    }
    const sent = { ...message, deliveryState: 'sent' as const };
    this.setCachedMessage(sent);
    return sent;
  }

  async retryMessage(messageId: Id): Promise<Message> {
    const snapshot = this.snapshot ?? await this.load();
    const message = requireEntity(snapshot.messages.find((item) => item.id === messageId), 'That message could not be found.');
    if (message.deliveryState !== 'failed') return message;
    let storedMediaUri: string | null = null;
    try {
      storedMediaUri = message.mediaUri
        ? await uploadKinMedia(this.client, {
            mediaId: `${message.id}-retry-${Date.now()}`,
            sourceUri: message.mediaUri,
            spaceId: message.spaceId,
            userId: message.senderId,
          })
        : null;
    } catch {
      return message;
    }
    const result = await this.client.from('messages').insert({
      body: message.body,
      created_at: message.createdAt,
      id: message.id,
      kind: message.kind,
      media_uri: storedMediaUri,
      sender_id: message.senderId,
      space_id: message.spaceId,
    });
    const updated = { ...message, deliveryState: result.error ? 'failed' as const : 'sent' as const };
    this.setCachedMessage(updated);
    return updated;
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
    } catch (error) {
      throw new RepositoryError('save_failed', `Kin could not upload that memory. ${errorMessage(error)}`, 'retry');
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

  private async ensureUserId(): Promise<string> {
    const current = await this.client.auth.getUser();
    if (current.data.user) return current.data.user.id;
    const anonymous = await this.client.auth.signInAnonymously();
    if (anonymous.error || !anonymous.data.user) {
      throw new RepositoryError('auth_required', 'Sign in to use connected Kin.', 'reconnect');
    }
    return anonymous.data.user.id;
  }

  private setCachedMessage(message: Message) {
    if (!this.snapshot) return;
    const exists = this.snapshot.messages.some((item) => item.id === message.id);
    this.snapshot = {
      ...this.snapshot,
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
    this.channel = this.client
      .channel(`kin-member-updates-${spaceIds.length}`)
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

function assertResult(
  error: { message: string } | null,
  code: RepositoryErrorCode,
  message: string,
  action?: 'retry' | 'reset' | 'reenter' | 'onboard' | 'reconnect',
): asserts error is null {
  if (error) throw new RepositoryError(code, `${message} ${error.message}`, action);
}

function requireEntity<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new RepositoryError('not_found', message);
  return value;
}

function makeInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'K');
}

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
