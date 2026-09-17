# Kin Messaging and Notifications Production Plan

> **Execution note:** Follow this plan task-by-task with test-driven development. Preserve the
> completed Space safety/account lifecycle behavior and do not begin billing until the final local
> checkpoint is green or a hosted/device gate is explicitly recorded.

**Goal:** Complete production messaging with bounded history, stable optimistic/idempotent sends,
explicit connectivity and unread state, safe media handling, per-installation push delivery,
notification preferences, and authenticated notification routing.

**Architecture:** PostgreSQL owns idempotency, unread cursors, recipient eligibility, and a private
push outbox. The repository loads only the newest page for each Space, merges realtime records into
optimistic messages by client UUID, and loads older pages through a membership-checked function.
Native notification code sits behind a platform-neutral service so demo/web remain deterministic.
A secret-protected scheduled Edge Function claims push work with leases, sends through Expo, checks
receipts, and logs only coarse delivery state. The UI exposes connection/read/pagination states
without blocking text messaging when media or notifications are unavailable.

**Stack:** Expo Router / React Native, Supabase Postgres/RLS/Realtime/Storage/Edge Functions,
`@react-native-community/netinfo`, `expo-notifications`, `expo-device`, Jest, Playwright, pgTAP, Deno.

## Product decisions fixed by the approved production design

- Newest 50 messages load per Space; older history loads in pages of 50 from a stable
  `(created_at, id)` cursor.
- Client-generated UUIDs are the idempotency keys. A retry never creates a second message and never
  overwrites a different payload under the same UUID.
- Read receipts and typing indicators remain out of scope. Unread counts are private per membership.
- Notification permission is offered only after a successful two-person connection and only after a
  user gesture. Denial never disables messaging and Profile always exposes the current state.
- Notification preview is a global profile preference. When disabled, the push body says only that
  a new Kin message arrived.
- Push is native-only in this phase. Web remains fully usable and truthfully labels native push as
  unavailable rather than registering a fake token.
- Notification delivery is best-effort and cannot roll back a message.
- A notification opens `/space/<spaceId>` only after session restoration and membership validation.
- Sign-out and account deletion deactivate the current installation. Leave/block prevent recipient
  selection immediately through active-membership checks.
- Selected images are normalized before upload, limited to supported image types and 10 MB after
  processing, and use a deterministic object path based on the message UUID.

---

## Task 1: Establish database messaging contracts

**Files**

- Create: `supabase/migrations/202609170002_messaging_notifications.sql`
- Create: `supabase/tests/messaging_notifications.sql`
- Modify: `src/data/supabase/database.types.ts`

### Red tests

Add pgTAP coverage proving:

1. `send_kin_message` derives the sender from `auth.uid()`, rejects inactive/non-members, validates
   kind/body/media, and inserts once for a repeated client UUID.
2. Reusing another sender's UUID or changing the payload under an existing UUID fails.
3. Direct authenticated message insertion is revoked so callers cannot bypass outbox creation.
4. `list_space_messages` returns newest-first bounded pages and rejects strangers/leavers.
5. `mark_space_read` updates only the caller's active membership.
6. `get_my_unread_counts` excludes self-authored messages and clears after marking read.
7. One pending outbox row is created only for the other active member; block/leave suppresses it.
8. Push installations are owner-only, installation IDs cannot be claimed across accounts, and
   account deletion removes them.
9. Outbox/receipt/worker functions and delivery metadata are service-role only.
10. Concurrent worker claims use `FOR UPDATE SKIP LOCKED`, claim tokens, and expiring leases.

### Implementation

- Add `last_read_at` to `kin_space_members` with a safe backfill from `joined_at`.
- Add `notification_previews_enabled boolean not null default true` to `profiles`.
- Add `push_installations` with user ID, installation ID, Expo token, platform, active flag,
  last-seen timestamps, and unique ownership constraints.
- Add private `message_notification_outbox` with recipient/Space/message IDs, status, attempts,
  lease token/timestamps, Expo ticket/receipt metadata, retry time, and coarse error code.
- Replace client message insertion with `send_kin_message(client_message_id, target_space_id,
  message_kind, message_body, message_media_uri) returns messages`.
- Add stable page/read/unread/register/deactivate/claim/complete/fail functions with fixed search
  paths and minimum grants.
- Add indexes for `(space_id, created_at desc, id desc)`, unread queries, installation ownership,
  and pending outbox claims.

### Checkpoint

Run `npm run test:database && npm run typecheck`.

Commit: `feat: define production messaging contracts`

---

## Task 2: Make repository messaging bounded and idempotent

**Files**

- Modify: `src/domain/models.ts`
- Modify: `src/data/contracts.ts`
- Modify: `src/data/supabase/SupabaseKinRepository.ts`
- Modify: `src/data/supabase/mappers.ts`
- Modify: `src/data/demo/DemoKinRepository.ts`
- Modify: repository/domain tests

### Red tests

- Initial connected load requests at most 51 rows per Space and exposes `hasOlderMessages`.
- `loadOlderMessages` merges a page without duplicates and keeps optimistic/failed messages.
- A realtime echo with the same UUID reconciles `sending` to `sent` rather than duplicating.
- An ambiguous insert response followed by retry returns the stored row as sent.
- Failed sends can be removed locally; deterministic uploaded media is deleted only when
  unreferenced.
- Refreshing after realtime keeps already loaded older pages and local failed messages.

### Implementation

- Add per-Space message page metadata to the runtime snapshot without persisting volatile
  connection state.
- Add `loadOlderMessages`, `markSpaceRead`, and `removeFailedMessage` repository methods.
- Resolve signed media only for rows entering the cache and preserve durable storage references
  internally so signed URL refresh never replaces the database path.
- Use the message RPC for initial send and retry. Upload the same deterministic path with safe
  idempotent semantics.
- Realtime handlers reconcile individual message/reaction payloads where safe; fall back to a
  bounded latest-page refresh without discarding older/local rows.

### Checkpoint

Run `npm test -- SupabaseKinRepository DemoKinRepository messaging && npm run typecheck`.

Commit: `feat: add idempotent paged messaging data`

---

## Task 3: Complete connectivity, history, unread, and failed-send UI

**Files**

- Add: `src/services/connectivity/*`
- Modify: `src/state/KinProvider.tsx`
- Modify: `src/features/chats/ChatScreen.tsx`
- Modify: `src/features/chats/MessageList.tsx`
- Modify: `src/features/chats/MessageBubble.tsx`
- Modify: `src/features/chats/ChatListScreen.tsx`
- Modify: component/acceptance/E2E tests

### Red tests

- Offline/reconnecting/restored banners are explicit and do not disable composing.
- Older history loads once, preserves scroll position, and exposes loading/end/retry states.
- Opening a Space marks it read; the Chats row shows a bounded accessible unread badge.
- New partner messages update preview/order/unread without duplicate optimistic rows.
- Failed bubbles expose separate Retry and Remove actions with accessible labels.
- Empty/loading/error/large-text/keyboard behavior remains usable at phone and wide viewports.

### Implementation

- Install and wrap NetInfo behind a deterministic connectivity port.
- Add a compact conversation status banner announced to screen readers only on state changes.
- Add top-of-history pagination controls with an in-flight lock and retry.
- Mark read after the active Space renders and when it regains foreground focus.
- Sort chat rows by latest activity, render unread count and accessible context, and never use unread
  as a relationship-pressure score.

### Checkpoint

Run focused Jest tests, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run e2e`.

Commit: `feat: complete resilient conversation states`

---

## Task 4: Normalize images and clean failed media

**Files**

- Modify: `src/services/media/contracts.ts`
- Modify: `src/services/media/expo.ts`
- Modify: `src/data/supabase/media.ts`
- Modify: message/repository tests
- Modify: `app.config.ts`

### Red tests

- Unsupported MIME types and processed files over 10 MB fail before Storage upload.
- Large images are resized/compressed while preserving a useful display size.
- Permission denial keeps text messaging available and links to platform settings.
- Retry reuses the same path; remove cleans an unreferenced object; a referenced object is retained.
- Sticker assets never enter Storage and request no microphone/camera permission.

### Implementation

- Add Expo Image Manipulator through the media adapter, not the repository.
- Normalize to JPEG except supported transparency-sensitive PNG/WebP inputs; cap the long edge and
  quality iteratively before upload.
- Return byte size/MIME metadata from the picker/normalizer and enforce again in the repository.
- Add service-only or owner-safe cleanup for unreferenced deterministic paths.

### Checkpoint

Run media/message tests, typecheck, lint, web export, and native config inspection.

Commit: `feat: harden private message media`

---

## Task 5: Add installation registration and notification preferences

**Files**

- Add: `src/services/notifications/contracts.ts`
- Add: `src/services/notifications/expo.native.ts`
- Add: `src/services/notifications/expo.web.ts`
- Add: `src/services/notifications/index.ts`
- Add: `src/features/notifications/NotificationSettings.tsx`
- Modify: `src/bootstrap/createAppRuntime.ts`
- Modify: `src/features/profile/ProfileScreen.tsx`
- Modify: `src/services/account/supabase.ts`
- Modify: `app/_layout.tsx`, `app.config.ts`, package files
- Add/modify tests

### Red tests

- Demo/web return honest unavailable states without asking permission.
- Native permission is requested only from the contextual Enable action after a two-person Space
  exists, never on first launch.
- Granted permission registers/rotates one installation for the signed-in user.
- Denial is non-blocking and Profile shows Settings recovery.
- Preview preference persists server-side and updates push content policy.
- Sign-out deactivates the installation before the local session is cleared; failure is retried on
  next startup without trapping the user.

### Implementation

- Install Expo notifications/device dependencies using Expo's version resolver.
- Add the notifications config plugin without fictional credentials.
- Derive the EAS project ID from Expo/EAS config; return a configuration state until the real project
  exists rather than inventing one.
- Persist a random installation ID in AsyncStorage, register the Expo token through the minimum RPC,
  and update last-seen on app foreground.
- Add contextual enable copy and Profile controls for permission state, preview, and device removal.

### Checkpoint

Run unit/component tests, Expo config verification, typecheck, lint, and web export.

Commit: `feat: add notification installation controls`

---

## Task 6: Deliver and reconcile Expo pushes

**Files**

- Create: `supabase/functions/send-message-notifications/index.ts`
- Add shared worker/auth tests
- Modify: `supabase/config.toml`, `package.json`
- Add: `docs/runbooks/notifications.md`

### Red tests

- A worker secret is required and compared without ordinary string short-circuiting.
- One worker cannot double-claim another worker's lease.
- Preview-disabled recipients receive generic copy; enabled recipients receive sender/body-safe copy.
- Invalid/unregistered tokens are deactivated; transient failures back off; message success is never
  changed by push failure.
- Expo ticket IDs are stored, receipts are checked, and no token/body/email is logged.
- Worker heartbeat/liveness is independent of queue depth.

### Implementation

- Claim due outbox rows in bounded batches through a service-only RPC.
- Send only Expo push tokens with `data: { spaceId, path }` and minimal title/body.
- Reconcile tickets/receipts, use bounded exponential retry, and deactivate permanent token errors.
- Add a secret-protected scheduled function, durable service-only heartbeat, five-minute Cron/Vault
  deployment recipe, >=400/timeout/liveness/backlog alerts, and manual recovery commands.

### Checkpoint

Run Deno tests/typecheck, pgTAP, a local HTTP auth/empty-batch smoke, and the complete local gate.

Commit: `feat: deliver private message notifications`

---

## Task 7: Route notification taps safely

**Files**

- Add: `src/features/notifications/NotificationRouter.tsx`
- Add: `src/features/notifications/pendingNotification.ts`
- Modify: `app/_layout.tsx`, `app/index.tsx`, route tests and E2E

### Red tests

- Foreground receipt does not navigate unexpectedly.
- A tap while signed in opens only an active member Space.
- A cold-start tap waits for auth/profile restoration, then opens the Space.
- Signed-out taps persist only the Space ID/path, never notification text/token, and resume after OTP.
- Leave/block/deleted/malformed targets fall back to Chats with clear recovery and clear pending state.
- Duplicate response delivery navigates at most once.

### Implementation

- Persist a versioned, minimal pending destination like invitation handoff.
- Validate destination against the loaded snapshot before navigation.
- Clear on completion, sign-out, invalid target, or explicit dismissal.

### Checkpoint

Run routing/unit/acceptance/E2E tests and the app gate.

Commit: `feat: route notification handoff`

---

## Task 8: Final messaging and notification verification

### Automated local gate

Run under Node 22:

```bash
npm run verify:ci
npm run e2e
npm run test:database
git diff --check
```

### Hosted preview gate

Using two controlled accounts and two physical devices:

1. Send/retry under a forced ambiguous response; prove exactly one message row.
2. Load more than 100 messages and prove stable pages with no gaps/duplicates.
3. Go offline, send/fail/retry/remove, reconnect, and prove realtime reconciliation.
4. Prove unread increments only for the recipient and clears on open.
5. Upload/receive/remove a processed image and verify deterministic Storage cleanup.
6. Grant and deny notification permission on separate devices; verify messaging remains usable.
7. Verify preview enabled/disabled bodies, foreground/background/terminated receipt, and tap routing.
8. Rotate token, sign out, leave, block, and delete; prove no further ineligible pushes.
9. Force transient/permanent Expo errors and verify retry, token deactivation, heartbeat, and alerts.

Record build IDs, operation IDs, timestamps, and pass/fail only. Do not capture tokens, private
message bodies, or notification payloads in the evidence log.

### Final commit

Commit any verification-only fixtures/docs as:

`test: verify production messaging notifications`
