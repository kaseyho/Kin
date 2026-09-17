# Kin Space safety and moderation runbook

This runbook is the operator contract for invitations, leave/block access loss, private reports,
report retention, and account-owned media cleanup. Run every SQL statement through the Supabase SQL
Editor or another server-only connection. Never place a service-role key in the app, a public shell
history, screenshots, logs, or submission materials.

## Consumer and data policy

| Event | Consumer-visible result | Server result |
| --- | --- | --- |
| Archive | The Space disappears for that user and can be restored from Profile. | Only that active membership's `archived` flag changes. |
| Leave | The Space disappears immediately. The leaver loses messages, memories, invitations, and media access. | Membership is made inactive, unused invites are revoked, ownership transfers when needed, and shared history remains for the active member. |
| Block | The Space disappears immediately and the pair cannot reconnect. | The block survives the Space exit and all active Spaces shared by the pair are ended. Rows involving an account are removed when that account is deleted. |
| Report | The reporter receives a private reference; the reported person never receives report details. | Evidence is available only to the reporter's receipt policy and service-role moderation. It is excluded from account export and ordinary Space reads. |
| Account deletion | The account and authored relationship content are deleted; a remaining member keeps their own content and any transferred Space. | Report identities are set to `NULL`, evidence is retained for 180 days, unused authored invites and blocks are removed, and media cleanup is durably queued. |

Demo reporting is a local preview only. Its UI explicitly says that nothing was sent to Kin or a
moderator. Preview and production builds cannot be created without a routable-looking support email.

Private memories are readable only by their creator while that creator is an active member. After
leave/block, neither the leaver nor the remaining member can read the leaver's private memory. Shared
messages, shared memories, and their media remain in the active member's Space after leave. Account
deletion removes records authored by the deleted account through foreign-key cleanup.

## Review reports safely

Start with metadata, not private report text:

```sql
select
  id,
  category,
  status,
  created_at,
  status_updated_at,
  retention_expires_at,
  reporter_id is null as reporter_deleted,
  reported_user_id is null as reported_user_deleted,
  space_id is not null as has_space_context,
  message_id is not null as has_message_context
from public.content_reports
where status in ('open', 'reviewing')
order by created_at asc;
```

Read `explanation` or associated content only for one selected report and only when necessary. Do not
copy report text into tickets or chat. Move the report through the service-only status function:

```sql
select public.update_content_report_status(
  'REPORT_UUID'::uuid,
  'reviewing'
);
```

Allowed states are `open`, `reviewing`, `resolved`, and `dismissed`. Use `reviewing` when an operator
starts work, `resolved` when action or support is complete, and `dismissed` only after determining the
report is not actionable. `status_updated_at` records the last transition. The function is revoked
from anonymous and authenticated clients.

Reports expire 180 days after submission even if one of the accounts is deleted. Run the purge from
a server-only scheduled job at least daily:

```sql
select public.purge_expired_content_reports();
```

The return value is the number deleted. Before production launch, configure this statement as a
daily Supabase Cron job and record one successful run. Do not extend retention ad hoc; legal or safety
holds require an explicit policy change and migration.

## Diagnose invitations without exposing secrets

Never select or log the `code` column. Diagnose by invitation ID and lifecycle metadata:

```sql
select
  id,
  space_id,
  created_by,
  created_at,
  expires_at,
  revoked_at,
  use_count,
  max_uses,
  redeemed_by
from public.space_invites
where id = 'INVITATION_UUID'::uuid;
```

- `revoked_at is not null`: intentionally revoked or revoked by leave/account cleanup.
- `expires_at <= now()`: expired.
- `use_count = max_uses`: redeemed.
- `redeemed_by is not null`: identifies the successful account without revealing the code.

Ask consumers for an approximate time and the non-secret report/invitation reference shown in the
UI. Never ask them to send an invite URL, short code, OTP, access token, or private message content.

## Retry account-owned media cleanup

Account deletion creates `account_storage_cleanup_jobs` before changing database/Auth state. Jobs
remain `prepared` while the profile exists. After Auth deletion atomically removes the profile and
finalizes its Spaces, the delete function claims eligible jobs with a 15-minute lease and attempts
them immediately. Empty-Space deletion and last-member leave also queue cleanup jobs. A Storage
failure still returns `deleted: true` with `cleanupPending: true` so the deleted consumer is not left
signed in to a nonexistent account.

Inspect only job metadata:

```sql
select id, operation_id, bucket_id, target_kind, status, attempts, last_error_code,
       created_at, updated_at, processing_started_at, completed_at
from public.account_storage_cleanup_jobs
where status in ('prepared', 'pending', 'processing')
order by created_at;
```

Load the server-only values from your password manager or secret manager. If entering the service
key interactively in zsh, the following prompt prevents the value from entering shell history:

```bash
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
read -rs "SUPABASE_SERVICE_ROLE_KEY?Service role key: "
export SUPABASE_SERVICE_ROLE_KEY
npm run cleanup:storage
unset SUPABASE_SERVICE_ROLE_KEY
```

To retry one operation:

```bash
npm run cleanup:storage -- --operation-id OPERATION_UUID
```

The worker never prints keys, object paths, emails, or content. A service-only database function
atomically claims each job, refuses to claim a prepared job while its owner profile exists, and
recovers a lease abandoned for more than 15 minutes. Failed jobs return to `pending` with an
incremented attempt count. One run claims at most 500 jobs; if it reports
`"batchLimitReached": true`, run it again until the field is false and `failed` is zero.

## Deploy automatic cleanup and retention

The `process-storage-cleanup` Edge Function is the required automatic consumer for account deletion,
empty-Space deletion, and last-member leave. It claims up to 100 jobs per invocation, retries failed
jobs on the next run, recovers abandoned 15-minute leases, and runs both retention purges. Manual
`npm run cleanup:storage` is recovery tooling, not the production scheduler.

Generate one random 32-byte-or-longer value in a password manager. Load it without putting the value
in shell history, set the Edge secret, and deploy:

```bash
read -rs "KIN_CLEANUP_CRON_SECRET?Cleanup Cron secret: "
export KIN_CLEANUP_CRON_SECRET
npx supabase secrets set KIN_CLEANUP_CRON_SECRET="$KIN_CLEANUP_CRON_SECRET"
npx supabase functions deploy process-storage-cleanup --no-verify-jwt
unset KIN_CLEANUP_CRON_SECRET
```

Enable the Supabase Cron and `pg_net` integrations. Store `project_url`, `publishable_key`, and the
same `kin_cleanup_cron_secret` value in Supabase Vault; do not leave the secret in a saved SQL Editor
query. Then schedule the worker every five minutes:

```sql
select cron.schedule(
  'kin-storage-cleanup',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets where name = 'project_url'
    ) || '/functions/v1/process-storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'
      ),
      'x-kin-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'kin_cleanup_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
```

This follows Supabase's documented
[scheduled Edge Function pattern](https://supabase.com/docs/guides/functions/schedule-functions).
The custom secret narrows access beyond the publishable API key. Verify one live response after
deployment and inspect failures from the default six-hour `pg_net` response window:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'kin-storage-cleanup';

select id, status_code, timed_out, error_msg, created
from net._http_response
where status_code >= 400 or error_msg is not null or timed_out
order by created desc;
```

Configure production alerts for every `process-storage-cleanup` response `>= 400`, `timed_out =
true`, or non-null `error_msg`; this includes a rotated/mismatched secret returning 401. Add a
liveness alert when the service-only `operator_maintenance_status.last_succeeded_at` is more than ten
minutes old, independent of queue depth or `pg_net` response retention. Also alert when a
`prepared` or `pending` job is older than 15 minutes, or a `processing` lease has exceeded 15
minutes:

```sql
select
  count(*) as overdue_jobs,
  min(created_at) as oldest_created_at
from public.account_storage_cleanup_jobs
where (
  status in ('prepared', 'pending')
  and created_at < now() - interval '15 minutes'
) or (
  status = 'processing'
  and processing_started_at < now() - interval '15 minutes'
);

select worker, last_started_at, last_succeeded_at, last_status, last_claimed, last_failed
from public.operator_maintenance_status
where worker = 'storage-cleanup';
```

The five-minute Cron is the automatic retry; any alert requires operator investigation using only
cleanup metadata and Edge/Cron status. Do not launch with an inactive Cron job or untested failure
and liveness alerts.

The worker runs both retention functions on every invocation:

```sql
select public.purge_expired_content_reports();
select public.purge_finished_storage_cleanup_jobs();
```

Completed cleanup metadata expires after 30 days. A prepared job for a confirmed live profile
expires after seven days; prepared/pending work for a deleted profile is retained until it succeeds.

## Local SQL/RLS verification

Docker Desktop must be running. Node 22, the project Supabase CLI, and the Docker daemon are required:

```bash
node --version
docker info
npm run test:database
```

The command starts an isolated local stack when needed, resets every migration, runs all pgTAP files,
and stops the stack it started. The suite covers atomic creation, concurrent single-use redemption,
the two-member cap, invite expiry/revocation, leave/block, report privacy, post-leave table and Storage
denial, account pseudonymization, retention purge, and durable media-cleanup jobs.

Run the complete application gate separately:

```bash
npm run verify:ci
npm run e2e
git diff --check
```

## Hosted pre-production smoke

Use two disposable verified email accounts (A and B), plus a third account (C), against the linked
preview project. Record timestamps, non-secret operation/report IDs, build ID, and pass/fail only.

1. A creates a Space and copies its HTTPS invitation. Sign out; open the URL; sign in/onboard as B;
   verify the same invitation resumes and B joins exactly once.
2. Try the same code as C and confirm the used/full result. Create a fresh controlled fixture and
   also verify an expired invitation and a revoked invitation have distinct recovery copy.
3. Verify A can rotate/revoke an unused invite without any URL or code appearing in logs.
4. Upload media as A. Verify both active members can view it. Leave as A; verify the Space vanishes,
   message writes fail, upload fails, and creating a signed URL/read for existing Space media fails.
5. In a separate fixture, block B as A. Verify the Space vanishes for A, new messages stop, and the
   pair cannot reconnect through another invitation.
6. Report a received message. Verify A sees a receipt, B cannot read the report row/details, and the
   service-only metadata query shows one `open` report. Transition it to `reviewing`, then `resolved`.
7. Delete A through fresh OTP. Verify ownership transfer, Auth/profile removal, removal of A-authored
   content/invites/blocks, retained pseudonymized report evidence, and completed cleanup jobs with
   empty `avatars/<A>/` and `chat-media/<space>/<A>/` prefixes.
8. Run the report purge against an intentionally expired preview fixture and verify only expired
   evidence is removed.
9. Leave a one-member Space containing media. Without running the manual worker, wait for the next
   Cron invocation and verify the object job completes and the object is gone.
10. Force one controlled Storage failure, verify the function returns 5xx and the alert fires, then
    restore Storage and verify the next Cron run completes the same pending job.

Local pgTAP proof does not substitute for these hosted Auth, Storage API, SMTP, and Edge Function
checks. Do not call the subsystem production-verified until all ten are recorded against preview,
then repeated for the production deployment using controlled accounts.
