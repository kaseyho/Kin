import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';

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
} from '@/data/contracts';
import { RepositoryError } from '@/data/errors';
import type { Id, KinSnapshot } from '@/domain/models';

export type KinLoadStatus = 'idle' | 'loading' | 'ready' | 'corrupt' | 'error';

export interface KinContextValue {
  mode: KinRepository['mode'];
  status: KinLoadStatus;
  snapshot: KinSnapshot | null;
  error: Error | null;
  resetDemo: () => Promise<void>;
  saveProfile: (input: SaveProfileInput) => ReturnType<KinRepository['saveProfile']>;
  createSpace: (input: CreateSpaceInput) => ReturnType<KinRepository['createSpace']>;
  joinSpace: (input: JoinSpaceInput) => ReturnType<KinRepository['joinSpace']>;
  rotateSpaceInvite: (
    input: RotateSpaceInviteInput,
  ) => ReturnType<KinRepository['rotateSpaceInvite']>;
  revokeSpaceInvite: (
    input: RevokeSpaceInviteInput,
  ) => ReturnType<KinRepository['revokeSpaceInvite']>;
  leaveSpace: (input: LeaveSpaceInput) => ReturnType<KinRepository['leaveSpace']>;
  blockSpaceMember: (
    input: BlockSpaceMemberInput,
  ) => ReturnType<KinRepository['blockSpaceMember']>;
  submitContentReport: (
    input: SubmitContentReportInput,
  ) => ReturnType<KinRepository['submitContentReport']>;
  sendMessage: (input: SendMessageInput) => ReturnType<KinRepository['sendMessage']>;
  retryMessage: (messageId: Id) => ReturnType<KinRepository['retryMessage']>;
  removeFailedMessage: (messageId: Id) => ReturnType<KinRepository['removeFailedMessage']>;
  loadOlderMessages: (spaceId: Id) => ReturnType<KinRepository['loadOlderMessages']>;
  markSpaceRead: (spaceId: Id) => ReturnType<KinRepository['markSpaceRead']>;
  addReaction: (input: AddReactionInput) => ReturnType<KinRepository['addReaction']>;
  updateSpacePreferences: (
    input: UpdateSpacePreferencesInput,
  ) => ReturnType<KinRepository['updateSpacePreferences']>;
  saveMemory: (input: SaveMemoryInput) => ReturnType<KinRepository['saveMemory']>;
  updateMemory: (input: UpdateMemoryInput) => ReturnType<KinRepository['updateMemory']>;
  deleteMemory: (memoryId: Id) => ReturnType<KinRepository['deleteMemory']>;
  archiveSpace: (
    spaceId: Id,
    userId: Id,
    archived: boolean,
  ) => ReturnType<KinRepository['archiveSpace']>;
  deleteLocalSpace: (
    spaceId: Id,
    userId: Id,
    confirmation: string,
  ) => ReturnType<KinRepository['deleteLocalSpace']>;
}

export const KinContext = createContext<KinContextValue | null>(null);

interface KinProviderProps extends PropsWithChildren {
  active?: boolean;
  repository: KinRepository;
}

export function KinProvider({ active = true, children, repository }: KinProviderProps) {
  const [status, setStatus] = useState<KinLoadStatus>(active ? 'loading' : 'idle');
  const [snapshot, setSnapshot] = useState<KinSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!active) return;

    let mounted = true;
    const unsubscribe = repository.subscribe((next) => {
      if (!mounted) return;
      setSnapshot(next);
      setStatus('ready');
      setError(null);
    });

    void repository
      .load()
      .then((next) => {
        if (!mounted) return;
        setSnapshot(next);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        const nextError = reason instanceof Error ? reason : new Error('Kin could not load.');
        setError(nextError);
        setStatus(
          reason instanceof RepositoryError && reason.code === 'demo_snapshot_corrupt'
            ? 'corrupt'
            : 'error',
        );
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [active, repository]);

  const resetDemo = useCallback(async () => {
    await repository.resetDemo();
  }, [repository]);

  const value = useMemo<KinContextValue>(
    () => ({
      mode: repository.mode,
      status: active ? status : 'idle',
      snapshot: active ? snapshot : null,
      error: active ? error : null,
      resetDemo,
      saveProfile: (input) => repository.saveProfile(input),
      createSpace: (input) => repository.createSpace(input),
      joinSpace: (input) => repository.joinSpace(input),
      rotateSpaceInvite: (input) => repository.rotateSpaceInvite(input),
      revokeSpaceInvite: (input) => repository.revokeSpaceInvite(input),
      leaveSpace: (input) => repository.leaveSpace(input),
      blockSpaceMember: (input) => repository.blockSpaceMember(input),
      submitContentReport: (input) => repository.submitContentReport(input),
      sendMessage: (input) => repository.sendMessage(input),
      retryMessage: (messageId) => repository.retryMessage(messageId),
      removeFailedMessage: (messageId) => repository.removeFailedMessage(messageId),
      loadOlderMessages: (spaceId) => repository.loadOlderMessages(spaceId),
      markSpaceRead: (spaceId) => repository.markSpaceRead(spaceId),
      addReaction: (input) => repository.addReaction(input),
      updateSpacePreferences: (input) => repository.updateSpacePreferences(input),
      saveMemory: (input) => repository.saveMemory(input),
      updateMemory: (input) => repository.updateMemory(input),
      deleteMemory: (memoryId) => repository.deleteMemory(memoryId),
      archiveSpace: (spaceId, userId, archived) =>
        repository.archiveSpace(spaceId, userId, archived),
      deleteLocalSpace: (spaceId, userId, confirmation) =>
        repository.deleteLocalSpace(spaceId, userId, confirmation),
    }),
    [active, error, repository, resetDemo, snapshot, status],
  );

  return <KinContext.Provider value={value}>{children}</KinContext.Provider>;
}
