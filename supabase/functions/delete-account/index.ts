import {
  AccountDeletionError,
  type CleanupJob,
  executeAccountDeletion,
} from '../_shared/account-deletion.ts';
import {
  adminClient,
  authenticate,
  HttpError,
  json,
  preflight,
  requireFreshToken,
} from '../_shared/http.ts';

type ClaimedCleanupRow = {
  attempts: number;
  bucket_id: CleanupJob['bucketId'];
  id: string;
  processing_token: string;
  target_kind: CleanupJob['targetKind'];
  target_path: string;
};

Deno.serve(async (request) => {
  const earlyResponse = preflight(request);
  if (earlyResponse) return earlyResponse;

  const operationId = crypto.randomUUID();
  let userId = 'unknown';
  try {
    const authenticated = await authenticate(request);
    userId = authenticated.user.id;
    requireFreshToken(authenticated.accessToken);
    const admin = adminClient();

    const result = await executeAccountDeletion({
      activateCleanupJobs: async (_targetOperationId, targetUserId) => {
        const claimed = await admin.rpc('claim_account_storage_cleanup_jobs', {
          maximum_jobs: 500,
          target_operation_id: null,
          target_owner_id: targetUserId,
        });
        if (claimed.error || !claimed.data) throw new Error('cleanup_job_activation_failed');
        return claimed.data.map((job: ClaimedCleanupRow) => ({
          attempts: job.attempts,
          bucketId: job.bucket_id,
          id: job.id,
          processingToken: job.processing_token,
          targetKind: job.target_kind,
          targetPath: job.target_path,
        }));
      },
      completeCleanupJob: async (job) => {
        const completed = await admin
          .from('account_storage_cleanup_jobs')
          .update({
            attempts: job.attempts,
            completed_at: new Date().toISOString(),
            last_error_code: '',
            processing_started_at: null,
            processing_token: null,
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
          .eq('processing_token', job.processingToken)
          .eq('status', 'processing')
          .select('id')
          .maybeSingle();
        if (completed.error || !completed.data) throw new Error('cleanup_job_completion_failed');
      },
      deleteAuthUser: async (targetUserId) => {
        const deletion = await admin.auth.admin.deleteUser(targetUserId);
        return { error: Boolean(deletion.error) };
      },
      failCleanupJob: async (job) => {
        const failed = await admin
          .from('account_storage_cleanup_jobs')
          .update({
            attempts: job.attempts,
            completed_at: null,
            last_error_code: 'storage_cleanup_failed',
            processing_started_at: null,
            processing_token: null,
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
          .eq('processing_token', job.processingToken)
          .eq('status', 'processing');
        if (failed.error) throw new Error('cleanup_job_failure_update_failed');
      },
      hasOutstandingCleanup: async (targetUserId) => {
        const outstanding = await admin
          .from('account_storage_cleanup_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', targetUserId)
          .in('status', ['prepared', 'pending', 'processing']);
        if (outstanding.error) throw new Error('cleanup_job_count_failed');
        return (outstanding.count ?? 0) > 0;
      },
      prepareCleanupJobs: async (targetOperationId, targetUserId) => {
        const preparation = await admin.rpc('prepare_account_storage_cleanup', {
          target_operation_id: targetOperationId,
          target_user_id: targetUserId,
        });
        if (preparation.error) throw new Error('cleanup_job_creation_failed');
      },
      profileExists: async (targetUserId) => {
        const profile = await admin
          .from('profiles')
          .select('id')
          .eq('id', targetUserId)
          .maybeSingle();
        if (profile.error) throw new Error('profile_lookup_failed');
        return Boolean(profile.data);
      },
      removeCleanupTarget: (job) => removeCleanupTarget(admin, job),
    }, operationId, userId);

    console.log(JSON.stringify({
      cleanupPending: result.cleanupPending,
      operationId,
      status: result.cleanupPending ? 'deleted_cleanup_pending' : 'deleted',
      userId,
    }));
    return json({ ...result, operationId });
  } catch (error) {
    const failureCode = error instanceof AccountDeletionError ? error.code : 'deletion_failed';
    console.error(JSON.stringify({ operationId, status: failureCode, userId }));
    if (error instanceof HttpError) return json({ error: error.code }, error.status);
    return json({ error: failureCode, operationId }, 500);
  }
});

async function removeCleanupTarget(
  admin: ReturnType<typeof adminClient>,
  job: CleanupJob,
): Promise<void> {
  if (job.targetKind === 'object') {
    const removed = await admin.storage.from(job.bucketId).remove([job.targetPath]);
    if (removed.error) throw new Error('storage_delete_failed');
    return;
  }

  await removePrefix(admin, job.bucketId, job.targetPath);
}

async function removePrefix(
  admin: ReturnType<typeof adminClient>,
  bucket: string,
  prefix: string,
): Promise<void> {
  const paths: string[] = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const listed = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (listed.error) throw new Error('storage_list_failed');
    const objects = listed.data ?? [];
    paths.push(...objects.filter((item) => item.id).map((item) => `${prefix}/${item.name}`));
    if (objects.length < pageSize) break;
    offset += pageSize;
  }

  for (let index = 0; index < paths.length; index += 100) {
    const removed = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (removed.error) throw new Error('storage_delete_failed');
  }
}
