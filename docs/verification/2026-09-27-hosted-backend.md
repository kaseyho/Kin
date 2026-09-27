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

This deployment does not prove store billing, webhook reconciliation, SMTP deliverability, native
push delivery, scheduled worker invocation, or physical-device behavior. Those require RevenueCat,
store, mail, push, scheduler, and device configuration and remain open release gates.
