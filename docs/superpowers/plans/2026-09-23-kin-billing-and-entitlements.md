# Kin Billing and Entitlements Production Plan

> **Execution note:** Follow this plan task-by-task with test-driven development on `main`.
> Preserve the completed auth, Space safety, messaging, notification, and account-lifecycle
> behavior. Hosted purchase verification remains a separate external gate until the RevenueCat and
> store credentials exist.

**Goal:** Ship Kin+ across iOS, Android, and web with Supabase-authenticated RevenueCat identity,
dashboard-owned products/prices, quiet cancellation and recoverable failures, subscription
management, a verified server entitlement projection, and a server-enforced five-new-Moments free
limit that cannot be bypassed through direct API calls.

**Architecture:** The Supabase user UUID is the RevenueCat App User ID on every platform. Native
clients use `react-native-purchases`; web uses `@revenuecat/purchases-js` and RevenueCat Billing.
The client SDK is the responsive UI entitlement source, while an HMAC-authenticated Edge Function
uses RevenueCat's subscriber API to maintain a private database projection. PostgreSQL owns the
authoritative memory-creation limit and creates a memory plus its source-message links atomically
under a per-membership lock. A client-generated memory UUID makes retries idempotent.

**Stack:** Expo Router / React Native, RevenueCat React Native SDK and Customer Center,
RevenueCat Web SDK, Supabase Postgres/RLS/Edge Functions, Jest, Playwright, pgTAP, Deno.

## Product decisions fixed by the approved production design

- Kin+ unlocks premium relationship themes and unlimited **new** Moments. Messaging and every
  existing Moment stay readable and editable without Kin+.
- Each non-premium user may create five memories that they own in each active Kin Space. Shared
  memories created by the other member do not consume that user's allowance.
- Supabase Auth UUID is the RevenueCat App User ID on iOS, Android, and web. Purchase and restore
  actions remain unavailable until that identity is active.
- iOS and Android use their platform-specific public SDK keys. Web uses its RevenueCat Billing
  public key and identified-user checkout. No secret RevenueCat key reaches a client bundle.
- Products, packages, localized prices, billing periods, trials, and offerings come from the
  RevenueCat dashboard; the app does not hard-code commercial terms.
- Restore is always visible. User cancellation is quiet. Actual load, purchase, restore, identity,
  and management failures use stable Kin-authored copy and an explicit retry.
- Active subscribers can open the correct App Store, Google Play, or RevenueCat customer portal.
- A RevenueCat webhook is accepted only after authorization and timestamped HMAC verification. It
  then fetches current subscriber state instead of inferring entitlement state from event type.
- The server entitlement projection is private and service-role writable. PostgreSQL—not the
  paywall or local cache—enforces the free-memory limit.
- Demo retains a clearly labelled local entitlement. Preview/production never fall back to demo or
  silently unlock premium behavior when RevenueCat is unavailable.
- Billing logs and evidence never contain email, purchase tokens, webhook bodies, memory text, or
  secret keys.

## Current official integration constraints

- RevenueCat clients must be configured once and then switch identified users through
  `logIn`/`changeUser`; the app must not purchase under an unbound anonymous session.
- The Web SDK supports identified checkout through `@revenuecat/purchases-js` and exposes
  `changeUser` for account switching.
- `CustomerInfo.managementURL` selects the appropriate store/customer portal for the active
  subscription. Native Customer Center remains a supported fallback where configured.
- RevenueCat recommends handling every webhook by fetching `GET /v1/subscribers/{app_user_id}` so
  the server syncs one current Customer Info shape rather than event-specific partial fields.
- RevenueCat webhook HMAC is computed over the exact raw `"<timestamp>.<body>"` bytes and must be
  checked before JSON parsing with a bounded timestamp tolerance.

Official references:

- https://www.revenuecat.com/docs/customers/identifying-customers
- https://www.revenuecat.com/docs/web/web-billing/web-sdk
- https://www.revenuecat.com/docs/integrations/webhooks
- https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions
- https://www.revenuecat.com/docs/api-v1/customers

---

## Task 1: Define private entitlement and atomic-memory database contracts

**Files**

- Create: `supabase/migrations/202609230002_billing_entitlements.sql`
- Create: `supabase/tests/billing_entitlements.sql`
- Modify: `src/data/supabase/database.types.ts`
- Modify: `scripts/verify-supabase.mjs`

### Red tests

Add pgTAP coverage proving:

1. `billing_entitlements` and `revenuecat_webhook_events` are unreadable and unwritable by `anon`
   and `authenticated`; only `service_role` and narrowly granted security-definer functions can
   mutate them.
2. `sync_revenuecat_entitlement` is service-role only, is idempotent by RevenueCat event ID, and
   rejects malformed user IDs, entitlement IDs, timestamps, stores, and environments.
3. `has_active_kin_plus` is true only for an active `kin_plus` projection whose expiration is null
   or in the future.
4. `create_memory_item` derives `created_by` from `auth.uid()`, requires active membership, validates
   all fields/media/source-message IDs, and creates the item plus links in one transaction.
5. Source messages must exist in the same Space; strangers, leavers, and blocked members fail.
6. A repeated client memory UUID with the same normalized payload returns the existing row, while a
   changed payload or a UUID owned by another user fails with an idempotency conflict.
7. A non-premium user can create exactly five owned memories per Space; a concurrent sixth request
   cannot pass the limit. Shared memories owned by the partner do not consume the caller's limit.
8. An active projected Kin+ entitlement permits additional memories. Expiration or revocation
   immediately restores the limit without deleting or hiding existing memories.
9. Direct authenticated inserts into `memory_items` and `memory_item_messages` are revoked, while
   existing creator-authorized update/delete behavior remains intact.
10. A data-bearing upgrade preserves existing memories/source links and backfills no synthetic
    premium state.

### Implementation

- Add private `billing_entitlements` keyed by `(user_id, entitlement_id)` with active state,
  expiration, product/store/environment, last event ID, and sync timestamps.
- Add private `revenuecat_webhook_events` keyed by RevenueCat event ID with only coarse processing
  metadata; never store the webhook body or subscriber attributes.
- Add `sync_revenuecat_entitlement(...)` as a fixed-search-path, service-role-only function that
  records the event and updates the projection atomically.
- Add `has_active_kin_plus(target_user_id uuid)` for internal server checks only.
- Add `create_memory_item(client_memory_id, target_space_id, memory_kind, memory_visibility,
  memory_title, occurred_on, memory_note, memory_place, source_message_ids, memory_media_uris)`.
- Lock the caller's active membership row before count-and-insert so parallel requests cannot both
  claim the fifth slot. Count only rows owned by the caller in the target Space.
- Compare the full normalized payload and source-link set on idempotent replay. Use stable database
  error markers `KIN_MEMORY_LIMIT_REACHED`, `KIN_MEMORY_IDEMPOTENCY_CONFLICT`, and
  `KIN_MEMORY_INVALID` for client mapping.
- Revoke direct authenticated insert privileges/policies for memories and source links; keep select,
  creator update, and creator delete privileges under the existing active-membership RLS.
- Extend the database verifier with a data-bearing pre-migration seed and post-migration assertions.

### Checkpoint

Run `npm run test:database && npm run typecheck`.

Commit: `feat: define billing entitlement contracts`

---

## Task 2: Make memory creation idempotent and server-authoritative

**Files**

- Modify: `src/data/contracts.ts`
- Modify: `src/data/errors.ts`
- Modify: `src/data/supabase/SupabaseKinRepository.ts`
- Modify: `src/data/demo/DemoKinRepository.ts`
- Modify: `src/data/supabase/media.ts`
- Modify: `src/features/moments/MemoryEditorScreen.tsx`
- Modify: `src/state/KinProvider.tsx` if its method typing changes
- Modify: memory/repository/media tests

### Red tests

- The editor creates one client memory UUID per draft and reuses it across retry presses.
- Connected saves call only `create_memory_item`; they never insert `memory_items` or source links
  directly.
- An ambiguous first response followed by retry returns one stored memory with one set of links.
- Server `KIN_MEMORY_LIMIT_REACHED` opens Kin+ even when the local snapshot or SDK entitlement was
  stale; existing saved memories remain available.
- Client-side count is only an early affordance and counts memories owned by the signed-in user,
  not the partner's shared memories.
- A deterministic validation/limit failure after upload removes only newly uploaded, unreferenced
  objects. An ambiguous database response probes/retries the same UUID and never deletes media that
  may already be referenced.
- Demo mode applies the same per-user, per-Space five-item rule and idempotency behavior without
  pretending its entitlement is a server projection.
- A save in flight cannot submit twice, and stable Kin copy replaces raw Supabase/provider errors.

### Implementation

- Add required `clientMemoryId` to `SaveMemoryInput`; generate it once when the editor draft mounts.
- Keep deterministic object paths `${clientMemoryId}-${index}` so retries upsert the same objects.
- Replace direct table/link inserts with the atomic RPC and map its stable error markers to
  `RepositoryError('memory_limit', ...)`, `save_failed`, or validation recovery.
- On an ambiguous RPC failure, repeat/read by the same UUID before reporting failure. Delete uploads
  only when the server definitively rejected the mutation and no memory row references them; leave
  uncertain objects for the existing cleanup workflow rather than risking live-media deletion.
- Reconcile the RPC row into the snapshot and retain the durable storage references internally.
- Make the editor route a server limit result to `onRequestKinPlus` and preserve the draft.

### Checkpoint

Run focused memory/repository/media tests, `npm run typecheck`, and `npm run lint`.

Commit: `feat: enforce idempotent memory creation`

---

## Task 3: Implement authenticated RevenueCat services on native and web

**Files**

- Modify: `src/domain/models.ts`
- Modify: `src/services/billing/contracts.ts`
- Modify: `src/services/billing/revenuecat.native.ts`
- Modify: `src/services/billing/revenuecat.web.ts`
- Modify: `src/services/billing/demo.ts`
- Modify: `src/services/billing/index.ts`
- Modify: `package.json`, `package-lock.json`
- Add: `src/services/billing/__tests__/revenuecat.native.test.ts`
- Add: `src/services/billing/__tests__/revenuecat.web.test.ts`
- Modify: `src/services/billing/__tests__/demo.test.ts`

### Red tests

- No SDK configure, offering, purchase, restore, or management call occurs before a Supabase user ID
  is activated.
- Native configures once with the platform public key and first Supabase UUID, uses `logIn` to switch
  users, and detaches on session end without exposing the previous user's entitlement.
- Web configures once with the web public key and first Supabase UUID, then uses `changeUser` for
  account switches. Signed-out state is locally cleared and cannot purchase.
- Both implementations read only the `kin_plus` active entitlement and include expiration and
  management availability without logging customer data.
- Offerings expose dashboard package IDs, titles, localized prices, and billing-period/trial copy
  when the provider supplies it; empty current offerings return a truthful empty state.
- Native and web purchase the exact package object loaded from the current offering.
- Cancellation maps to `BillingError('cancelled')`; every other provider failure maps to stable
  Kin-authored copy with no raw message, token, or product payload.
- Native restore uses the store restore API. Web restore refreshes identified Customer Info because
  RevenueCat Billing purchases are account-bound and web has no store receipt restore operation.
- Management opens a validated `https:` management URL; native may fall back to RevenueCat Customer
  Center when the URL is absent. Missing management configuration is a recoverable stable error.
- Demo remains explicitly `source: 'demo'`; production missing any required platform public key
  still fails fast.

### Implementation

- Install `@revenuecat/purchases-js` and keep `react-native-purchases` /
  `react-native-purchases-ui` as the native implementation.
- Extend `PremiumService` with `activateUser(userId)`, `deactivateUser()`, and
  `manageSubscription()`. Make purchase operations reject an inactive identity.
- Extend package/domain models only with dashboard-derived display metadata needed by the UI.
- Configure SDKs lazily after auth restoration. Hold one configured instance per platform and guard
  all async results with the currently active Supabase UUID.
- Clear local entitlement/offering/package caches synchronously on deactivation; perform provider
  logout/change-user cleanup without allowing cleanup failure to trap Supabase sign-out.
- Retain purchase objects privately by package ID; never reconstruct price/product identifiers in
  the app.
- Validate management URLs and use Expo Linking/browser behavior appropriate to the platform.

### Checkpoint

Run billing service tests, `npm run typecheck`, `npm run lint`, and `npm run export:web:demo`.

Commit: `feat: add authenticated cross-platform billing`

---

## Task 4: Bind premium state to auth and complete the Kin+ experience

**Files**

- Modify: `src/bootstrap/createAppRuntime.ts`
- Modify: `src/state/AuthProvider.tsx`
- Modify: `app/_layout.tsx`
- Modify: `src/features/premium/PremiumProvider.tsx`
- Modify: `src/features/premium/KinPlusScreen.tsx`
- Modify: `src/features/premium/usePremiumGate.ts`
- Modify: `src/features/profile/ProfileScreen.tsx` if management entry is surfaced there
- Modify: runtime/auth/premium/profile tests
- Modify: `e2e/billing.spec.ts` or create it when absent

### Red tests

- Premium activation waits for restored auth, uses the signed-in UUID, and resets immediately on
  sign-out, account deletion, or switch before any stale promise can update the new session.
- Auth sign-out attempts notification deactivation and RevenueCat detachment, but either cleanup
  failure remains non-blocking and never skips Supabase sign-out.
- Loading entitlement and loading offering are distinct. A failed offering does not erase an active
  entitlement, and restore remains available in loading, empty, and error states.
- Purchase and restore buttons have one in-flight lock, useful disabled/busy accessibility state,
  and cannot initiate a second transaction.
- Cancellation changes no visible error state. Purchase, restore, offering, identity, and management
  failures have separate retry actions and stable copy.
- Active Kin+ shows expiration/renewal-neutral status and a Manage subscription action. Inactive
  Kin+ shows dashboard-derived package labels and no invented discount, trial, or savings claim.
- Missing offerings have truthful dashboard/configuration copy in preview/development and never
  recommend demo mode from a production build.
- Keyboard, large text, screen reader labels/live regions, narrow phone, and wide web layouts remain
  usable. Messaging-free and existing-memory guarantees stay visible.
- E2E covers demo entitlement, unavailable/retry/restore, active/manage affordance, and a server
  memory-limit recovery path without simulating a successful real purchase.

### Implementation

- Construct the premium service before account/auth lifecycle wrappers so both sign-out and account
  deletion can detach it.
- Pass auth identity/status into `PremiumProvider`; expose separate session, entitlement, offering,
  and transaction states plus `retryOffering`, `retryPurchase`, `restore`, and `manage` actions.
- Use operation revisions so a completed request for user A cannot update user B or signed-out UI.
- Keep restore visible at all times after identity activation. Disable only the conflicting action
  while a transaction is running.
- Add a Manage subscription button only for active entitlement and preserve the existing parchment,
  plum, rose, editorial, and kept-corner visual language.

### Checkpoint

Run premium/runtime/auth tests, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run e2e`.

Commit: `feat: complete Kin Plus purchase states`

---

## Task 5: Receive verified RevenueCat webhooks and sync entitlement projection

**Files**

- Create: `supabase/functions/_shared/revenuecat-webhook.ts`
- Create: `supabase/functions/_shared/revenuecat-webhook.test.ts`
- Create: `supabase/functions/revenuecat-webhook/index.ts`
- Modify: `supabase/config.toml`
- Modify: `package.json`
- Add: `docs/runbooks/billing.md`

### Red tests

- Missing/wrong authorization, missing/malformed signature, bad hex, expired/future timestamp, and a
  body changed after signing all fail before JSON parsing or outbound calls.
- HMAC comparison is constant-time over the exact raw request body.
- Malformed events, missing IDs, blocked/ambiguous user IDs, and multiple distinct Supabase UUIDs in
  one RevenueCat alias set fail closed without granting entitlement.
- The function accepts exactly one Supabase UUID from `app_user_id`, `original_app_user_id`, or
  `aliases`, URL-encodes the RevenueCat lookup ID, and sends the secret API key only server-side.
- Every valid event fetches current `GET /v1/subscribers/{app_user_id}` state; event type alone never
  activates or revokes Kin+.
- Active, expired, lifetime, grace-period, missing, sandbox, and production entitlement payloads map
  deterministically to the private projection.
- Duplicate webhook event IDs are idempotent. Failed RevenueCat/database calls return a retryable
  non-2xx response and are not marked processed.
- Logs contain only event ID, coarse event type/environment, correlation ID, and outcome—never the
  raw body, auth header, signature, email, product receipt, or subscriber attributes.

### Implementation

- Configure `revenuecat-webhook` with Supabase JWT verification disabled because RevenueCat is the
  caller; require `REVENUECAT_WEBHOOK_AUTHORIZATION`, `REVENUECAT_WEBHOOK_SIGNING_SECRET`, and
  `REVENUECAT_SECRET_API_KEY` from Edge Function secrets.
- Read the request body once as text, validate the authorization header, parse the
  `X-RevenueCat-Webhook-Signature` timestamp/signature, enforce a five-minute tolerance, and verify
  HMAC-SHA256 before parsing JSON.
- Resolve exactly one UUID-shaped Supabase App User ID. Reject ambiguous account aliases instead of
  sharing an entitlement across accounts.
- Fetch current RevenueCat subscriber state and map only `kin_plus` to
  `sync_revenuecat_entitlement`; use response request time/expiration to determine active state.
- Return 200 only after the projection transaction succeeds. Let RevenueCat retry transient
  failures and document dashboard resend/reconciliation commands.
- Document separate sandbox webhook routing for staging and production-only routing for production,
  secret rotation, dashboard configuration, health checks, redacted evidence, and manual
  reconciliation.

### Checkpoint

Run Deno tests/typecheck, pgTAP, a local signed-request HTTP smoke, and the complete local gate.

Commit: `feat: sync RevenueCat entitlements securely`

---

## Task 6: Add release configuration and operator verification

**Files**

- Modify: `.env.example`
- Modify: `src/config/environment.ts`
- Modify: `scripts/verify-environment.mjs`
- Modify: `scripts/verify-production-bundle.mjs`
- Modify: `README.md`
- Modify: `docs/runbooks/billing.md`
- Modify: environment/config tests

### Red tests

- Production requires the platform RevenueCat public key for the bundle being built and rejects
  sandbox/demo key prefixes where RevenueCat distinguishes them.
- The web bundle contains the web public key only; native keys remain selected by platform; no
  RevenueCat secret, webhook authorization, or signing secret can enter Expo public config or the
  exported bundle.
- Demo does not require provider credentials and remains visibly demo. Development/preview missing
  keys show unavailable configuration rather than mock success.
- The runbook lists exact dashboard identifiers, entitlement lookup key `kin_plus`, offering/package
  expectations, store/web product mapping, webhook filters, and evidence to capture without secrets.
- Account switching, account deletion, and subscription-management caveats are documented,
  including that deleting a RevenueCat customer does not cancel a store subscription.

### Implementation

- Keep only `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`,
  `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`, and `EXPO_PUBLIC_REVENUECAT_WEB_API_KEY` in client
  environment parsing.
- Keep all secret/API/HMAC values in Supabase Edge Function secrets and provider dashboards.
- Add static bundle scans for secret variable names and known secret-key prefixes.
- Add local setup, sandbox, deployment, webhook resend, entitlement reconciliation, rollback, and
  support procedures to the billing runbook and developer README.

### Checkpoint

Run environment/config tests, `npm run verify:ci`, `npm run e2e`, `npm run test:database`, and
`git diff --check`.

Commit: `chore: document Kin Plus release operations`

---

## Task 7: Final billing and entitlement verification

### Automated local gate

Run under Node 22:

```bash
npm run verify:ci
npm run e2e
npm run test:database
git diff --check
```

Also confirm a clean production web export contains no RevenueCat server secret names/values and
that all new Edge Function tests are included in `typecheck:functions` and `test:functions`.

### Hosted staging gate

Using a staging Supabase project, RevenueCat sandbox/Test Store configuration, two controlled
Supabase accounts, and physical iOS/Android devices plus web:

1. Confirm the same Supabase UUID appears as the RevenueCat App User ID on all three platforms.
2. Load dashboard-configured monthly/annual/web packages and verify localized prices/terms match the
   stores and RevenueCat dashboard.
3. Cancel checkout on each platform and prove no error banner or entitlement change.
4. Complete a sandbox purchase; verify client entitlement, webhook delivery, subscriber refresh,
   and the private server projection agree.
5. Create the sixth owned Moment after activation and prove success; expire/revoke the sandbox
   entitlement and prove another new Moment is blocked while all existing Moments remain usable.
6. Restore/reload on a second device and web account session; prove the same entitlement appears.
7. Switch between two accounts on one device/browser and prove no entitlement or package state leaks
   across sessions.
8. Open Manage subscription and reach the correct App Store, Google Play, or RevenueCat portal.
9. Replay the same webhook, deliver an out-of-order lifecycle event, and force a transient
   RevenueCat/Supabase failure; prove idempotency, current-state resync, and retry behavior.
10. Attempt direct memory inserts and forged entitlement writes with an authenticated client; prove
    both are denied.

Record build IDs, RevenueCat event IDs, Supabase function request IDs, timestamps, platform, and
pass/fail only. Do not record email, purchase token, secret, webhook body, memory text, or private
media URL.

### Final commit

Commit any verification-only fixtures/docs as:

`test: verify production billing entitlements`

Do not mark this task complete until the hosted purchase/device gate has real evidence. If
credentials or devices remain unavailable, record the automated pass separately and carry this as
an explicit external release blocker into deployment planning.
