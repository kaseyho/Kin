import { createClient } from '@supabase/supabase-js';

const supabaseUrl = requireEnvironment('SUPABASE_URL');
const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
const operationId = readOperationId(process.argv.slice(2));
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const claimed = await admin.rpc('claim_account_storage_cleanup_jobs', {
  maximum_jobs: 500,
  target_operation_id: operationId,
  target_owner_id: null,
});
if (claimed.error || !claimed.data) fail('Could not claim Storage cleanup jobs.');

let failed = 0;
let completed = 0;
for (const job of claimed.data) {
  try {
    await removeCleanupTarget(job);
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
      .eq('processing_token', job.processing_token)
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
      .eq('processing_token', job.processing_token)
      .eq('status', 'processing');
  }
}

const batchLimitReached = claimed.data.length === 500;
process.stdout.write(JSON.stringify({
  batchLimitReached,
  claimed: claimed.data.length,
  completed,
  failed,
}) + '\n');
if (failed > 0 || batchLimitReached) process.exitCode = 1;

async function removeCleanupTarget(job) {
  if (job.target_kind === 'object') {
    const removed = await admin.storage.from(job.bucket_id).remove([job.target_path]);
    if (removed.error) throw new Error('storage_delete_failed');
    return;
  }

  await removePrefix(job.bucket_id, job.target_path);
}

async function removePrefix(bucket, prefix) {
  const paths = [];
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

function readOperationId(args) {
  const index = args.indexOf('--operation-id');
  if (index === -1) return null;
  const value = args[index + 1];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '')) {
    fail('Pass a valid UUID after --operation-id.');
  }
  return value;
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Set ${name} in the server-only operator environment.`);
  return value;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
