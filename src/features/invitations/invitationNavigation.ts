import type { StorageAdapter } from '@/data/contracts';

import { readPendingInvite } from './pendingInvite';

export interface PendingInviteDestination {
  pathname: '/invite/[code]';
  params: { code: string };
}

export async function readPendingInviteDestination(
  storage: StorageAdapter,
): Promise<PendingInviteDestination | null> {
  const code = await readPendingInvite(storage);
  return code ? { pathname: '/invite/[code]', params: { code } } : null;
}
