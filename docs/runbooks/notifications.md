# Kin message notifications runbook

This runbook is the operator contract for native message notification registration, Expo push
delivery, ticket/receipt reconciliation, retry recovery, and liveness monitoring. Web and demo
remain fully usable without push. Never place an Expo token, message body, email address, service
role key, Cron secret, or Expo access token in logs, screenshots, tickets, or submission materials.

Kin creates one private outbox job per active installation when a message commits. Message success
does not depend on push success. Each job has its own lease, Expo ticket, receipt, retry schedule,
and terminal state, so one failing phone cannot duplicate a successful notification on another.
Registration and send fan-out are capped at the five most recently active installations per account.
Preview-disabled accounts receive only **New Kin message — Open Kin to see it.** Notification data
contains only the Space ID and canonical `/space/<spaceId>` path.

The delivery upgrade fans out only legacy pending work newer than 24 hours. Older legacy queue rows
become terminal with `notification_upgrade_stale`, preventing a deployment-time burst of old pushes.

## Local verification

Run the credential-free contracts under Node 22:

```bash
nvm use 22
npm run typecheck:functions
npm run test:functions
npm run test:database
```

The database gate first upgrades seeded data from the previously committed recipient-level schema,
then resets cleanly and proves private table/function grants, capped per-installation fan-out, send
and receipt lease exclusion, ticket storage, receipt completion, block/leave suppression, and account
cleanup. The Deno suite proves exact secret comparison, preview policy, token deactivation,
exponential retry, ticket/receipt normalization, content-free logging summaries, and HTTP status
behavior.

For an actual local HTTP empty-queue smoke, keep the local Supabase stack running, then start the
function in one terminal. Enter the temporary secret interactively so it does not enter shell
history:

```bash
(
  set -e
  read -rs "KIN_NOTIFICATION_CRON_SECRET?Temporary notification worker secret: "
  export KIN_NOTIFICATION_CRON_SECRET
  notification_env_file=$(mktemp)
  cleanup_notification_smoke() {
    unset KIN_NOTIFICATION_CRON_SECRET
    rm -f "$notification_env_file"
  }
  trap cleanup_notification_smoke EXIT INT TERM
  chmod 600 "$notification_env_file"
  printf 'KIN_NOTIFICATION_CRON_SECRET=%s\n' "$KIN_NOTIFICATION_CRON_SECRET" > "$notification_env_file"
  npx supabase functions serve send-message-notifications \
    --no-verify-jwt \
    --env-file "$notification_env_file"
)
```

In another terminal, confirm the missing-secret request fails and the authorized empty batch
succeeds. Enter the same temporary value interactively in this terminal; do not paste it into the
command itself:

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --request POST http://127.0.0.1:54321/functions/v1/send-message-notifications

read -rs "KIN_NOTIFICATION_CRON_SECRET?Temporary notification worker secret: "
export KIN_NOTIFICATION_CRON_SECRET
curl --silent --show-error \
  --request POST \
  --header "x-kin-cron-secret: $KIN_NOTIFICATION_CRON_SECRET" \
  http://127.0.0.1:54321/functions/v1/send-message-notifications
```

Expected results are `401` and a `200` JSON summary with zero or more coarse counters. A response
must never contain a token, sender, email, or message body. Unset the request-terminal value, then
stop the function with Ctrl-C; the serving subshell removes its temporary env file and secret:

```bash
unset KIN_NOTIFICATION_CRON_SECRET
```

## Production secrets and native credentials

Generate a unique random value of at least 32 bytes in a password manager for
`KIN_NOTIFICATION_CRON_SECRET`. This must not be reused for Storage cleanup. Expo enhanced push
security is recommended; when enabled in the EAS dashboard, store its token as
`EXPO_ACCESS_TOKEN`. Neither name may use the `EXPO_PUBLIC_` prefix.

The native apps also require the real EAS project ID and valid APNs/FCM credentials. Configure
those through EAS credentials and build a development client; remote push does not work in Expo Go
on Android. The client truthfully shows **Build setup needed** until a real EAS project ID exists.

Set server secrets without echoing them:

```bash
read -rs "KIN_NOTIFICATION_CRON_SECRET?Notification Cron secret: "
export KIN_NOTIFICATION_CRON_SECRET
npx supabase secrets set KIN_NOTIFICATION_CRON_SECRET="$KIN_NOTIFICATION_CRON_SECRET"

read -rs "EXPO_ACCESS_TOKEN?Expo enhanced-security access token: "
export EXPO_ACCESS_TOKEN
npx supabase secrets set EXPO_ACCESS_TOKEN="$EXPO_ACCESS_TOKEN"

npx supabase functions deploy send-message-notifications --no-verify-jwt
unset KIN_NOTIFICATION_CRON_SECRET EXPO_ACCESS_TOKEN
```

If enhanced push security is not enabled, omit `EXPO_ACCESS_TOKEN`; the worker supports Expo's
unauthenticated server API. Production should enable it before consumer launch.

## Schedule every five minutes

Enable Supabase Cron and `pg_net`. Store the project URL, publishable key, and dedicated worker
secret in Supabase Vault. Do not leave their values in a saved SQL Editor query. Then create the
five-minute job:

```sql
select cron.schedule(
  'kin-message-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets where name = 'project_url'
    ) || '/functions/v1/send-message-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'
      ),
      'x-kin-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'kin_notification_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
```

The custom secret is required even though the function accepts a public API-key header. Ticketed
jobs become eligible for receipt lookup after 15 minutes, matching Expo's current guidance. An
absent receipt stays attached to its accepted ticket and is polled again with a separately leased,
bounded schedule; it is never resent merely because the receipt service omitted it. After Expo's
24-hour receipt-retention window it ends as delivery-unknown for operator review. Only an explicit
retryable Expo receipt error releases a notification for a new send.

The ticket, receipt, batch-size, retry, and error policies follow Expo's official
[Push Service delivery guide](https://docs.expo.dev/push-notifications/sending-notifications/).

## Monitoring and alerts

Configure alerts for every Cron response `>= 400`, `timed_out = true`, or non-null `error_msg`:

```sql
select id, status_code, timed_out, error_msg, created
from net._http_response
where status_code >= 400 or timed_out or error_msg is not null
order by created desc;
```

The worker updates liveness even when the queue is empty. Alert when a successful run is more than
10 minutes old, when the latest run is incomplete, or when its failed count is non-zero:

```sql
select worker, last_started_at, last_succeeded_at, last_status, last_claimed, last_failed, updated_at
from public.operator_maintenance_status
where worker = 'message-notifications'
  and (
    last_succeeded_at is null
    or last_succeeded_at < now() - interval '10 minutes'
    or last_status <> 'succeeded'
    or last_failed > 0
  );
```

Alert on overdue pending/processing work and ticketed work that has missed the expected receipt
window. Inspect only counts and timestamps:

```sql
select status, count(*) as jobs, min(created_at) as oldest_created_at
from public.message_notification_outbox
where (
  status = 'pending' and next_attempt_at < now() - interval '10 minutes'
) or (
  status = 'processing' and processing_started_at < now() - interval '5 minutes'
) or (
  status = 'ticketed'
  and receipt_next_attempt_at < now() - interval '10 minutes'
  and (
    receipt_processing_started_at is null
    or receipt_processing_started_at < now() - interval '5 minutes'
  )
)
group by status;
```

`DeviceNotRegistered` deactivates that installation. Message rate limits, network/5xx errors, and
credential mismatches use bounded exponential retry up to eight claims; credential mismatches and
invalid credentials require checking EAS APNs/FCM configuration. HTTP 400 payload failures and
oversized notifications are terminal and should be investigated from coarse error codes only.

## Manual recovery

The five-minute Cron is the normal retry path. To invoke recovery once, load the dedicated secret
interactively and call the function. Repeat only while the response reports retryable work; the
database lease prevents a second worker from double-claiming active jobs.

```bash
read -rs "KIN_NOTIFICATION_CRON_SECRET?Notification Cron secret: "
export KIN_NOTIFICATION_CRON_SECRET
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "x-kin-cron-secret: $KIN_NOTIFICATION_CRON_SECRET" \
  https://YOUR_PROJECT.supabase.co/functions/v1/send-message-notifications
unset KIN_NOTIFICATION_CRON_SECRET
```

Never edit message success or resend the original message to repair push. To retire an exposed Cron
secret, rotate the Supabase secret and Vault value together, redeploy, invoke once, and verify the
liveness row. To retire an exposed Expo access token, rotate it in EAS, update the Supabase secret,
redeploy, and verify a controlled-device ticket and receipt.

## Hosted and physical-device acceptance

Before consumer launch, prove all of the following against the hosted preview project and two
physical devices:

1. Enable from an established two-person Space; first launch and web never prompt.
2. Send with previews on and confirm the sender/text preview, then turn previews off and confirm
   generic copy.
3. Register two devices for one recipient and verify one ticket/receipt per installation with no
   duplicate retries.
4. Tap from foreground, background, cold start, and signed-out states; complete the Task 7 routing
   checklist before calling this end-to-end complete.
5. Rotate a token on foreground, sign out, switch accounts on the same device, and confirm the old
   account receives nothing.
6. Leave and block before sending; confirm no job is enqueued.
7. Disable the current device in Profile and confirm it remains disabled across foreground refresh.
8. Verify the Cron, `pg_net` failure alert, liveness alert, overdue-job alert, and a deliberately
   wrong secret returning 401.

Record only job IDs, ticket IDs, timestamps, HTTP status, and coarse error codes. Do not record the
notification body or Expo token. Expo delivery is best-effort and has no SLA; ticket success means
Expo accepted the request, while receipt success means APNs/FCM accepted it, not that a person read
the message.
