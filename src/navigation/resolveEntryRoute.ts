import type { KinLoadStatus } from '@/state/KinProvider';
import type { AuthState } from '@/services/auth/contracts';
import type { KinSnapshot } from '@/domain/models';

export type EntryRoute = 'loading' | '/auth' | '/onboarding' | '/(tabs)/chats';

export function resolveEntryRoute({
  authState,
  kinStatus,
  snapshot,
}: {
  authState: AuthState;
  kinStatus: KinLoadStatus;
  snapshot: KinSnapshot | null;
}): EntryRoute {
  if (authState.status === 'loading') return 'loading';
  if (authState.status === 'signed-out') return '/auth';
  if (kinStatus !== 'ready' || !snapshot) return 'loading';

  if (authState.status === 'demo') {
    return snapshot.currentUserId ? '/(tabs)/chats' : '/onboarding';
  }

  const hasProfile = snapshot.profiles.some(
    (profile) => profile.id === snapshot.currentUserId,
  );
  return hasProfile ? '/(tabs)/chats' : '/onboarding';
}
