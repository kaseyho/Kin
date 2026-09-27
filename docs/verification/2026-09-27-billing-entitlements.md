# Kin billing and entitlement verification evidence

Date: 2026-09-27

Verified commit: `8601b7a` (`chore: document Kin Plus release operations`)

This record separates reproducible local proof from the hosted RevenueCat, store, Supabase, and
physical-device evidence that still requires release infrastructure. No provider credential,
receipt, webhook body, email address, message text, or private media location belongs in this file.

## Automated local gate

All commands ran under Node 22 on the verified commit.

| Gate | Evidence | Result |
| --- | --- | --- |
| Application and release CI | `npm run verify:ci` | Passed: environment validation; TypeScript; ESLint; 66 Jest suites / 337 tests; demo web export; production bundle scan; Edge Function checks/tests; dependency policy. |
| Production web isolation | `npm run verify:bundle-config` | Passed: the web key and required public runtime values were present; native RevenueCat keys, server-secret names, server-secret fixtures, and known secret prefixes were absent. |
| Edge Function type checks | `npm run typecheck:functions` | Passed: five functions, including `supabase/functions/revenuecat-webhook/index.ts`, were checked with Deno 2.9.6. |
| Edge Function tests | `npm run test:functions` | Passed: 33 tests, including `supabase/functions/_shared/revenuecat-webhook.test.ts`. |
| Browser journeys | `npm run e2e` | Passed: 11 Playwright tests, including labelled demo checkout/restore, notification, invitation, safety, accessibility, phone, and wide-screen flows. |
| Database upgrade and policy proof | `npm run test:database` | Passed: data-bearing upgrade suites (8 notification checks and 5 billing checks) plus 117 pgTAP assertions across billing, RLS, lifecycle, cleanup, notifications, and concurrency. |
| Production dependency policy | `npm run audit:production` through CI | Passed policy: 13 moderate, 0 high, 0 critical advisories. |
| Patch integrity | `git diff --check` | Passed with no whitespace errors. |

The local webhook HTTP smoke also accepted a correctly signed raw body through request validation
(`400 event_invalid` for the intentionally incomplete `{}` fixture) and rejected the same signature
after the body bytes changed (`401 signature_invalid`). The temporary local secrets were removed
after the smoke.

## Provider-boundary coverage proved locally

- The client uses the signed-in Supabase UUID as the RevenueCat App User ID and clears identity-bound
  billing state during sign-out or account switching.
- Production rejects missing, wrong-platform, secret-looking, and Test Store RevenueCat keys.
  Development/preview may show a truthful unavailable state; demo needs no provider credentials.
- Purchase cancellation, stale identity revisions, package metadata, management fallbacks, and
  web/native SDK boundaries have automated component/service coverage.
- The webhook authenticates exact authorization and raw-body HMAC, rejects ambiguous ownership,
  URL-encodes subscriber lookup, refreshes current subscriber state, derives active/grace/lifetime
  access from that state, and keeps provider/database failures retryable.
- The database atomically records idempotent webhook events and private entitlement projections;
  authenticated clients cannot write those tables or bypass the server-authoritative Moment limit.

## Current provider contract review

RevenueCat's primary documentation was rechecked on 2026-09-27:

- [Webhooks](https://www.revenuecat.com/docs/integrations/webhooks) confirms exact raw-body HMAC,
  five-minute replay tolerance as a valid policy, subscriber refresh after any webhook, automatic
  non-200 retries, per-attempt signatures, manual resend, and duplicate-event handling.
- [Event types and fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
  confirms the selected subscription-lifecycle events carry the subscriber identity fields the
  parser requires. Transfer and temporary-grant payloads use different, reduced field groups and
  therefore remain outside this projection contract.
- [Restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior) confirms that
  **Transfer if there are no active subscriptions** preserves an active identified subscriber while
  still allowing an inactive receipt to move to a new identified App User ID.
- [Customer Info model](https://production-docs.revenuecat.com/docs/api-v1/customer-info-model)
  confirms the server response fields used for entitlement, expiry, store, and sandbox mapping.

## Hosted provider release gate

Status: **backend deployed; production billing is not release-approved.**

Supabase production project `pmbygfrnervzgprympeq` now has all eight migrations, the private
entitlement/event tables, generated webhook authentication and signing secrets, and the active
`revenuecat-webhook` function. EAS preview and production environments contain the public Supabase
URL and publishable key. The RevenueCat server API key, project/offering/products, store products,
sandbox receipts, and device evidence are still missing, so no purchase or entitlement lifecycle
claim has been made. Hosted backend proof is recorded in
[`2026-09-27-hosted-backend.md`](2026-09-27-hosted-backend.md).

The following evidence requires a configured RevenueCat sandbox/Test Store project, App Store
Connect and Google Play sandbox products, two controlled Supabase accounts, and physical iOS and
Android devices in addition to web. Record only build IDs, coarse RevenueCat event IDs, Supabase
function request IDs, timestamps, platform, and pass/fail.

1. Prove the same Supabase UUID is the RevenueCat App User ID on iOS, Android, and web.
2. Verify dashboard monthly/annual/web packages and localized store terms.
3. Cancel checkout on each platform without an error or entitlement mutation.
4. Complete a sandbox purchase and reconcile client state, webhook delivery, subscriber refresh,
   and the private Supabase projection.
5. Create a sixth owned Moment while active; expire/revoke access; prove the next new Moment is
   blocked while existing Moments remain usable.
6. Restore/reload on a second device and web session.
7. Switch between two accounts on one device/browser without entitlement or package leakage.
8. Open the correct platform subscription-management destination.
9. Replay a webhook, send an out-of-order lifecycle event, and force one transient provider and
   database failure to prove idempotency, current-state resync, and retry.
10. From an authenticated client, prove direct Moment insertion and forged entitlement writes are
    denied in hosted staging.

Use [`docs/runbooks/billing.md`](../runbooks/billing.md) for exact identifiers, secret placement,
deployment, sandbox steps, redaction, reconciliation, rollback, and support procedures. Do not mark
this gate passed from screenshots of dashboard configuration alone; it requires end-to-end purchase
and device evidence.
