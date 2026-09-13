import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';

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
} from '@/data/contracts';
import { RepositoryError } from '@/data/errors';
import type { Id, KinSnapshot } from '@/domain/models';

export type KinLoadStatus = 'loading' | 'ready' | 'corrupt' | 'error';

export interface KinContextValue {
  mode: KinRepository['mode'];
  status: KinLoadStatus;
  snapshot: KinSnapshot | null;
  error: Error | null;
  resetDemo: () => Promise<void>;
  saveProfile: (input: SaveProfileInput) => ReturnType<KinRepository['saveProfile']>;
  createSpace: (input: CreateSpaceInput) => ReturnType<KinRepository['createSpace']>;
  joinSpace: (input: JoinSpaceInput) => ReturnType<KinRepository['joinSpace']>;
  sendMessage: (input: SendMessageInput) => ReturnType<KinRepository['sendMessage']>;
  retryMessage: (messageId: Id) => ReturnType<KinRepository['retryMessage']>;
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
  repository: KinRepository;
}

export function KinProvider({ children, repository }: KinProviderProps) {
  const [status, setStatus] = useState<KinLoadStatus>('loading');
  const [snapshot, setSnapshot] = useState<KinSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = repository.subscribe((next) => {
      if (!active) return;
      setSnapshot(next);
      setStatus('ready');
      setError(null);
    });

    void repository
      .load()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const nextError = reason instanceof Error ? reason : new Error('Kin could not load.');
        setError(nextError);
        setStatus(
          reason instanceof RepositoryError && reason.code === 'demo_snapshot_corrupt'
            ? 'corrupt'
            : 'error',
        );
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  const resetDemo = useCallback(async () => {
    await repository.resetDemo();
  }, [repository]);

  const value = useMemo<KinContextValue>(
    () => ({
      mode: repository.mode,
      status,
      snapshot,
      error,
      resetDemo,
      saveProfile: (input) => repository.saveProfile(input),
      createSpace: (input) => repository.createSpace(input),
      joinSpace: (input) => repository.joinSpace(input),
      sendMessage: (input) => repository.sendMessage(input),
      retryMessage: (messageId) => repository.retryMessage(messageId),
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
    [error, repository, resetDemo, snapshot, status],
  );

  return <KinContext.Provider value={value}>{children}</KinContext.Provider>;
}
