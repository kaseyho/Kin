import type { CleanupJob } from '../_shared/account-deletion.ts';
import { secureSecretEqual } from '../_shared/cron-secret.ts';
import { adminClient, json, preflight } from '../_shared/http.ts';

const batchSize = 100;

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

  const configuredSecret = Deno.env.get('KIN_CLEANUP_CRON_SECRET');
  if (!configuredSecret) {
    console.error(JSON.stringify({ status: 'cleanup_worker_not_configured' }));
    return json({ error: 'worker_not_configured' }, 500);
  }
  if (!secureSecretEqual(request.headers.get('x-kin-cron-secret'), configuredSecret)) {
    return json({ error: 'authentication_required' }, 401);
  }

  const admin = adminClient();
  const startedAt = new Date().toISOString();
  const healthStarted = await admin
    .from('operator_maintenance_status')
    .update({
      last_started_at: startedAt,
      last_status: 'running',
      updated_at: startedAt,
    })
    .eq('worker', 'storage-cleanup');
  const claimed = await admin.rpc('claim_account_storage_cleanup_jobs', {
    maximum_jobs: batchSize,
    target_operation_id: null,
    target_owner_id: null,
  });
  if (claimed.error || !claimed.data) {
    console.error(JSON.stringify({ status: 'cleanup_claim_failed' }));
    return json({ error: 'cleanup_claim_failed' }, 500);
  }

  let completed = 0;
  let failed = 0;
  for (const row of claimed.data as ClaimedCleanupRow[]) {
    const job: CleanupJob = {
      attempts: row.attempts,
      bucketId: row.bucket_id,
      id: row.id,
      processingToken: row.processing_token,
      targetKind: row.target_kind,
      targetPath: row.target_path,
    };
    try {
      await removeCleanupTarget(admin, job);
      const result = await admin
        .from('account_storage_cleanup_jobs')
        .update({
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
      if (result.error || !result.data) throw new Error('job_update_failed');
      completed += 1;
    } catch {
      failed += 1;
      await admin
        .from('account_storage_cleanup_jobs')
        .update({
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
    }
  }

  const reportPurge = await admin.rpc('purge_expired_content_reports');
  const jobPurge = await admin.rpc('purge_finished_storage_cleanup_jobs');
  let maintenanceFailed = Boolean(healthStarted.error || reportPurge.error || jobPurge.error);
  const batchLimitReached = claimed.data.length === batchSize;
  const finishedAt = new Date().toISOString();
  const workerSucceeded = failed === 0 && !maintenanceFailed;
  const healthFinished = await admin
    .from('operator_maintenance_status')
    .update({
      last_claimed: claimed.data.length,
      last_failed: failed,
      ...(workerSucceeded ? { last_succeeded_at: finishedAt } : {}),
      last_status: workerSucceeded ? 'succeeded' : 'incomplete',
      updated_at: finishedAt,
    })
    .eq('worker', 'storage-cleanup');
  maintenanceFailed = maintenanceFailed || Boolean(healthFinished.error);
  const status = failed > 0 || maintenanceFailed ? 500 : batchLimitReached ? 202 : 200;

  console.log(JSON.stringify({
    batchLimitReached,
    claimed: claimed.data.length,
    completed,
    failed,
    maintenanceFailed,
    status: status === 500 ? 'cleanup_incomplete' : 'cleanup_complete',
  }));
  return json({
    batchLimitReached,
    claimed: claimed.data.length,
    completed,
    failed,
    maintenanceFailed,
    purgedCleanupJobs: jobPurge.data ?? 0,
    purgedReports: reportPurge.data ?? 0,
  }, status);
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

  const paths: string[] = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const listed = await admin.storage.from(job.bucketId).list(job.targetPath, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (listed.error) throw new Error('storage_list_failed');
    const objects = listed.data ?? [];
    paths.push(...objects
      .filter((item) => item.id)
      .map((item) => `${job.targetPath}/${item.name}`));
    if (objects.length < pageSize) break;
    offset += pageSize;
  }

  for (let index = 0; index < paths.length; index += 100) {
    const removed = await admin.storage.from(job.bucketId).remove(paths.slice(index, index + 100));
    if (removed.error) throw new Error('storage_delete_failed');
  }
}
