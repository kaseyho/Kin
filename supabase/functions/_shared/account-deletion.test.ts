import {
  AccountDeletionError,
  type AccountDeletionDependencies,
  type CleanupJob,
  executeAccountDeletion,
} from './account-deletion.ts';

const job: CleanupJob = {
  attempts: 0,
  bucketId: 'avatars',
  id: 'job-1',
  processingToken: 'claim-1',
  targetKind: 'prefix',
  targetPath: 'user-1',
};

function dependencies(
  overrides: Partial<AccountDeletionDependencies> = {},
): AccountDeletionDependencies {
  return {
    activateCleanupJobs: async () => [job],
    completeCleanupJob: async () => undefined,
    deleteAuthUser: async () => ({ error: false }),
    failCleanupJob: async () => undefined,
    hasOutstandingCleanup: async () => false,
    prepareCleanupJobs: async () => undefined,
    profileExists: async () => false,
    removeCleanupTarget: async () => undefined,
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('a preparation failure prevents Auth deletion', async () => {
  let authCalled = false;
  const error = new Error('prepare_failed');
  try {
    await executeAccountDeletion(dependencies({
      deleteAuthUser: async () => {
        authCalled = true;
        return { error: false };
      },
      prepareCleanupJobs: async () => {
        throw error;
      },
    }), 'operation-1', 'user-1');
    throw new Error('Expected preparation to fail');
  } catch (caught) {
    assert(caught === error, 'preparation error should be preserved');
    assert(!authCalled, 'Auth deletion must not start');
  }
});

Deno.test('a confirmed Auth failure leaves prepared jobs untouched', async () => {
  let activationCalled = false;
  try {
    await executeAccountDeletion(dependencies({
      activateCleanupJobs: async () => {
        activationCalled = true;
        return [];
      },
      deleteAuthUser: async () => ({ error: true }),
      profileExists: async () => true,
    }), 'operation-1', 'user-1');
    throw new Error('Expected Auth deletion to fail');
  } catch (caught) {
    assert(caught instanceof AccountDeletionError, 'a typed deletion error is required');
    assert(caught.code === 'auth_deletion_failed', 'the failure should be confirmed');
    assert(!activationCalled, 'prepared jobs must remain inactive');
  }
});

Deno.test('an ambiguous Auth response continues when the profile is gone', async () => {
  let activationCalled = false;
  const result = await executeAccountDeletion(dependencies({
    activateCleanupJobs: async () => {
      activationCalled = true;
      return [];
    },
    deleteAuthUser: async () => ({ error: true }),
    profileExists: async () => false,
  }), 'operation-1', 'user-1');

  assert(result.deleted, 'database absence proves deletion committed');
  assert(activationCalled, 'cleanup should activate after confirmed deletion');
});

Deno.test('a profile lookup error reports unknown state without activation', async () => {
  let activationCalled = false;
  try {
    await executeAccountDeletion(dependencies({
      activateCleanupJobs: async () => {
        activationCalled = true;
        return [];
      },
      deleteAuthUser: async () => ({ error: true }),
      profileExists: async () => {
        throw new Error('lookup_failed');
      },
    }), 'operation-1', 'user-1');
    throw new Error('Expected deletion state to be unknown');
  } catch (caught) {
    assert(caught instanceof AccountDeletionError, 'a typed deletion error is required');
    assert(caught.code === 'deletion_state_unknown', 'the uncertain state should be explicit');
    assert(!activationCalled, 'prepared jobs must remain inactive');
  }
});

Deno.test('an activation failure reports successful deletion with pending cleanup', async () => {
  const result = await executeAccountDeletion(dependencies({
    activateCleanupJobs: async () => {
      throw new Error('activation_failed');
    },
  }), 'operation-1', 'user-1');

  assert(result.deleted, 'the committed deletion remains successful');
  assert(result.cleanupPending, 'the caller must be told cleanup remains');
});

Deno.test('a target failure remains retryable', async () => {
  let failedJob: CleanupJob | null = null;
  const result = await executeAccountDeletion(dependencies({
    failCleanupJob: async (failed) => {
      failedJob = failed;
    },
    removeCleanupTarget: async () => {
      throw new Error('storage_failed');
    },
  }), 'operation-1', 'user-1');

  assert(result.cleanupPending, 'a Storage failure should be visible');
  assert(failedJob !== null, 'the durable job should be returned to pending');
  assert((failedJob as CleanupJob).id === job.id, 'the failed job should be preserved');
});

Deno.test('unclaimed work keeps cleanup pending after a successful batch', async () => {
  const result = await executeAccountDeletion(dependencies({
    activateCleanupJobs: async () => [],
    hasOutstandingCleanup: async () => true,
  }), 'operation-1', 'user-1');

  assert(result.cleanupPending, 'remaining work should be visible to the caller');
});
