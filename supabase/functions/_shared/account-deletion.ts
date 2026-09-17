export type CleanupTargetKind = 'object' | 'prefix';

export interface CleanupJob {
  attempts: number;
  bucketId: 'avatars' | 'chat-media';
  id: string;
  processingToken: string;
  targetKind: CleanupTargetKind;
  targetPath: string;
}

export interface AccountDeletionDependencies {
  activateCleanupJobs(operationId: string, userId: string): Promise<CleanupJob[]>;
  completeCleanupJob(job: CleanupJob): Promise<void>;
  deleteAuthUser(userId: string): Promise<{ error: boolean }>;
  failCleanupJob(job: CleanupJob): Promise<void>;
  hasOutstandingCleanup(userId: string): Promise<boolean>;
  prepareCleanupJobs(operationId: string, userId: string): Promise<void>;
  profileExists(userId: string): Promise<boolean>;
  removeCleanupTarget(job: CleanupJob): Promise<void>;
}

export interface AccountDeletionResult {
  cleanupPending: boolean;
  deleted: true;
}

export class AccountDeletionError extends Error {
  constructor(public readonly code: 'auth_deletion_failed' | 'deletion_state_unknown') {
    super(code);
    this.name = 'AccountDeletionError';
  }
}

export async function executeAccountDeletion(
  dependencies: AccountDeletionDependencies,
  operationId: string,
  userId: string,
): Promise<AccountDeletionResult> {
  await dependencies.prepareCleanupJobs(operationId, userId);

  const deletion = await dependencies.deleteAuthUser(userId);
  if (deletion.error) {
    let profileStillExists: boolean;
    try {
      profileStillExists = await dependencies.profileExists(userId);
    } catch {
      throw new AccountDeletionError('deletion_state_unknown');
    }
    if (profileStillExists) throw new AccountDeletionError('auth_deletion_failed');
  }

  let jobs: CleanupJob[];
  try {
    jobs = await dependencies.activateCleanupJobs(operationId, userId);
  } catch {
    return { cleanupPending: true, deleted: true };
  }

  let cleanupPending = false;
  for (const job of jobs) {
    try {
      await dependencies.removeCleanupTarget(job);
      await dependencies.completeCleanupJob(job);
    } catch {
      cleanupPending = true;
      try {
        await dependencies.failCleanupJob(job);
      } catch {
        // The durable pending row remains eligible for the retry worker.
      }
    }
  }

  try {
    cleanupPending = await dependencies.hasOutstandingCleanup(userId) || cleanupPending;
  } catch {
    cleanupPending = true;
  }

  return { cleanupPending, deleted: true };
}
