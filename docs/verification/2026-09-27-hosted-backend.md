# Kin hosted backend deployment evidence

Date: 2026-09-27

## Deployment

- Supabase organization: `Kin`
- Supabase project: `Kin Production`
- Project reference: `pmbygfrnervzgprympeq`
- Region: `ap-southeast-1`
- Project health at deployment: `ACTIVE_HEALTHY`
- Public API origin: <https://pmbygfrnervzgprympeq.supabase.co>

The project was created without selecting a paid compute size and is the account's second active
Free Plan project. No database password, API key, cron secret, provider secret, email address, or
private application data is recorded in this file.

## Database proof

All eight checked-in migrations were applied transactionally through Supabase's authenticated
Management API. The remote migration ledger was then aligned to the repository's exact migration
versions:

1. `202609130001_kin_mvp`
2. `202609160001_account_lifecycle`
3. `202609160002_space_safety_lifecycle`
4. `202609160003_content_report_receipt`
5. `202609170001_account_safety_cleanup`
6. `202609170002_messaging_notifications`
7. `202609230001_message_notification_delivery`
8. `202609230002_billing_entitlements`

Hosted inspection returned 17 public tables, no public table with RLS disabled, private Storage
buckets `avatars` and `chat-media`, and the required authenticated RPCs including
`create_memory_item`, `has_active_kin_plus`, and `claim_message_notification_jobs`.

The Management API path was used because Supabase CLI 2.117.0 and a clean 2.118.0 diagnostic both
hung while creating a passwordless temporary login role. Project API access and the documented
`/database/query` and `/database/migrations` routes succeeded as the `postgres` role. This is a
deployment-tooling limitation, not an application-schema failure.

## Edge Function proof

The following functions were deployed through the Supabase API and reported `ACTIVE`, version 1,
with gateway JWT verification disabled so their own bearer/cron/HMAC validation can run:

- `delete-account`
- `export-account`
- `process-storage-cleanup`
- `revenuecat-webhook`
- `send-message-notifications`

Generated high-entropy cleanup, notification, webhook authorization, and webhook HMAC values are
stored in Supabase Edge Function secrets and the developer's macOS Keychain. The RevenueCat secret
API key remains intentionally unset until the RevenueCat project is connected.

## Scheduled worker proof

Supabase Cron (`pg_cron`) and asynchronous networking (`pg_net`) are enabled. Vault contains the
project URL, public API key, and the two dedicated worker secrets under named entries; no decrypted
value is recorded here. Two active jobs run every five minutes:

- `kin-storage-cleanup`
- `kin-message-notifications`

An authenticated direct production invocation returned HTTP 200 for both workers. Storage cleanup
claimed zero jobs with zero failures and completed both retention purges. Message notifications
claimed zero jobs with zero failures and recorded a successful empty-queue heartbeat.

The first autonomous schedule boundary was observed at `2026-09-27T02:25:00Z`. Both Cron ledger
entries reported `succeeded`; both asynchronous HTTP responses were 200 with no timeout or error;
and both maintenance rows recorded `succeeded`, zero claimed jobs, and zero failures. This proves the
deployed scheduler-to-function path independently of the direct smoke call.

## Auth configuration proof

Hosted Auth has email signup enabled, email confirmation required, anonymous users disabled,
unverified-email sign-in disabled, and secure email change enabled. The project initially emitted
eight-digit email OTPs while the Kin client deliberately accepts six digits; the hosted setting was
corrected to six and read back through the authenticated Management API.

Custom SMTP is not configured, and the Auth site URL is still the Supabase default localhost URL
with no production redirect allow-list. Those remain release gates until the public production URL
and sender domain are selected.

## Build environment proof

EAS project `@moondrunk/kin` has the hosted Supabase URL and publishable key configured for both
`preview` and `production`. The values are public SDK configuration; no Supabase secret or
service-role value was placed in EAS public variables.

## Security-advisor disposition

The hosted security advisor returned no RLS-disabled-table finding. Its informational no-policy
findings are the expected deny-all posture for server-only job, entitlement, outbox, webhook, and
maintenance tables. Its authenticated `SECURITY DEFINER` warnings cover the app's deliberate RPC
surface; those functions derive identity from `auth.uid()`, enforce membership/ownership internally,
use fixed search paths, and are covered by the checked-in pgTAP and repository tests. Service-only
functions remain revoked from authenticated clients.

## Remaining hosted gates

This deployment does not prove store billing, webhook reconciliation, custom SMTP deliverability,
native push delivery, or physical-device behavior. The production Auth site URL and redirect
allow-list also remain unset. Those require RevenueCat, store, mail, public-hosting, push, and device
configuration and remain open release gates.
