# Kin staging backend and sandbox billing evidence

Date verified: 2026-09-29

This record contains provider identifiers and redacted configuration state only. Database
passwords, API keys, webhook authorization, HMAC material, receipts, and customer identifiers are
stored in provider secret stores and macOS Keychain, not this repository.

## Isolated Supabase staging

| Field | Evidence |
| --- | --- |
| Organization | `Kin` |
| Project | `Kin Staging` |
| Project reference | `phzulzklxcwzpuqfwqer` |
| Region | `ap-southeast-1` |
| Plan / health | Free project, `ACTIVE_HEALTHY` |
| Public API origin | <https://phzulzklxcwzpuqfwqer.supabase.co> |

All eight checked-in migrations were applied in one Management API transaction after the CLI
pooler connection timed out. The migration ledger contains all eight repository versions. Hosted
inspection returned 17 public tables, zero public tables without RLS, private `avatars` and
`chat-media` buckets, and the required `create_memory_item`, `has_active_kin_plus`, and
`claim_message_notification_jobs` RPCs.

Auth requires confirmed email, rejects anonymous sign-in, uses six-digit OTPs, and permits the
public demo URL plus the `kin://` app scheme for redirects. The default Supabase email service is
still used; custom SMTP remains a consumer-release gate rather than a hackathon sandbox gate.

## Functions and workers

The following staging functions are active with gateway JWT verification disabled so their own
bearer, cron, or HMAC validation runs:

- `delete-account` version 1
- `export-account` version 1
- `process-storage-cleanup` version 1
- `send-message-notifications` version 1
- `revenuecat-webhook` version 2

Staging-only cleanup, notification, webhook authorization, and webhook HMAC values are stored in
Supabase secrets and macOS Keychain. Direct authenticated calls to both workers returned HTTP 200
with zero claimed work and zero failures.

Supabase Vault holds the staging URL, public client key, and two worker secrets. The
`kin-storage-cleanup` and `kin-message-notifications` Cron jobs run every five minutes. Their first
observed autonomous boundary at `2026-09-29T03:05:00Z` succeeded, and both worker-maintained
liveness rows recorded `succeeded`, zero claimed work, and zero failures.

## RevenueCat sandbox boundary

RevenueCat webhook `Kin staging` (`whintgr165309bbec`) targets the staging Edge Function, sends
sandbox events only, and has HMAC signing enabled. It sends the same 12 subscription lifecycle
events as production while excluding transfers, temporary entitlement grants, virtual-currency
transactions, experiment enrollments, and purchase redemptions.

RevenueCat's signed synthetic `TEST` event reached the staging function and returned HTTP 400 with
`event_invalid`. This is the intended strict result because `TEST` is not a supported lifecycle
event; it also proves Authorization and HMAC validation passed because either mismatch returns HTTP
401 before schema validation.

## Connected preview build

EAS `preview` now uses the staging URL and publishable key, the RevenueCat Test Store Android key,
the public demo URL, and `kaseyho.work@gmail.com`. The evaluated Expo config reports deployment
`preview`, Android package `com.kaseyho.kin`, and the expected public URL and support email.

Connected Android build [`5566bd53-578b-4198-b069-d3d4f3fc9f60`](https://expo.dev/accounts/moondrunk/projects/kin/builds/5566bd53-578b-4198-b069-d3d4f3fc9f60)
finished successfully with internal distribution and the remote Android keystore. EAS built version
`1.0.0` / version code `1` from commit `a946b3b`. The downloaded APK is stored outside Git at
`output/android/kin-preview-staging-5566bd53.apk`; its ZIP structure passed `unzip -t` and its SHA-256
is `e277e6272e82abade32ec8446d74dfacb1a98479ceafe50a3440b4cafe352ec7`.

Inspection of the packaged `assets/index.android.bundle` found the staging Supabase project
reference, RevenueCat Test Store key prefix, public demo URL, and support email. The production
Supabase project reference was absent. The APK contains `arm64-v8a`, `armeabi-v7a`, `x86`, and
`x86_64` native libraries. EAS reports the application identifier as `com.kaseyho.kin` and build
profile as `preview`.

## Remaining proof

This deployment proves isolation, schema, RLS, functions, scheduling, secret validation, and a
completed connected native build. It does not prove a real Test Store purchase or restore. Install
the APK on a physical Android device, then complete the sandbox acceptance sequence in
`docs/runbooks/billing.md` before recording the final video.
