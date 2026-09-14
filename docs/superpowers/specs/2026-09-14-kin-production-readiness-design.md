# Kin Production Readiness Design

**Date:** 2026-09-14  
**Status:** Approved direction, ready for implementation planning  
**Branch:** `main`  
**Product:** Kin — a private, relationship-first messenger that remembers what matters

## 1. Decision

Kin will ship as a production-ready version of the existing relationship-first P0, not as a broad WhatsApp clone. The current visual direction, information architecture, and core loop remain intact:

> sign in → create or join a Kin Space → message → remember a message as a Moment, date, or plan → rediscover it in the relationship view, timeline, or On This Day

Production readiness means that every P0 capability is backed by real services, every visible control has a complete outcome, and every supported platform has a truthful loading, empty, error, offline, permission, and recovery state. Demo behavior may remain for the Devpost story, but it must never silently substitute for a broken production configuration.

The supported consumer surfaces are:

- responsive web, deployed at a stable HTTPS URL;
- iOS, delivered through an EAS production build suitable for App Store submission;
- Android, delivered through an EAS production build suitable for Google Play submission.

The first production release uses an intentionally designed light appearance. Automatic dark mode is disabled until a complete dark palette, media treatment, and contrast pass exist.

## 2. Scope boundary

### Included

- recoverable email one-time-password authentication;
- profile creation and editing;
- one-to-one Kin Space creation, invitation, joining, leaving, archiving, blocking, and reporting;
- text, image, and sticker messages with optimistic sending, retry, realtime delivery, pagination, offline feedback, and push notifications;
- reactions;
- per-person nickname, accent, theme, and wallpaper preferences;
- Remember this for Moments, important dates, and plans;
- private-by-default and deliberately shared memories;
- Moments feed, relationship panel, timeline, source-message context, and On This Day;
- Kin+ subscriptions and restore across web, iOS, and Android;
- account export, sign-out, and account deletion;
- privacy policy, terms, community standards, and support/reporting access;
- production logging, crash reporting hooks, migrations, CI, release runbooks, and reproducible developer setup;
- a clearly labelled, isolated demo mode for product demonstrations.

### Explicitly excluded

The original PRD intentionally defers groups, audio/video calls, voice notes, status feeds, forwarding, public profiles, contact discovery, read receipts, typing indicators, AI inference, relationship scoring, streaks, surveillance, and advertising. Shipping those would not make the approved Kin product more complete; it would change the product.

## 3. Current-state findings

The MVP has a strong visual foundation and a green local baseline, but the following prevent a consumer release:

- connected mode creates an anonymous Supabase identity, so a user can lose the account on reinstall or device change;
- production configuration silently falls back to demo mode when variables are absent or invalid;
- there is no deployed or linked Supabase project and no remote RLS, Realtime, Storage, or Edge Function proof;
- Space creation is a multi-step client transaction without rollback;
- connected Space deletion is surfaced in the UI but always returns `unavailable`;
- profiles store local avatar URIs rather than guaranteed private uploaded objects;
- invites are copy-only codes with no universal-link flow, regeneration, revocation, or pending-auth handoff;
- member cardinality is not constrained to Kin's one-to-one product promise;
- message history loads in one unbounded query and has no explicit reconnect/offline state;
- media failure can leave orphaned objects, and user-facing errors can expose provider details;
- push notifications, notification preferences, block/report, support contact, sign-out, export, and account deletion are absent;
- RevenueCat is not tied to the signed-in Supabase user, web billing is disabled, and premium limits are client-only;
- EAS project metadata, bundle identifiers, native permissions, icons, splash assets, build profiles, submission profiles, and store metadata are missing;
- the web and native release pipelines are not configured;
- the dependency audit currently reports moderate transitive advisories that require triage.

## 4. Product principles

1. **Relationship first.** A Kin Space feels like a private place shared by two people, not a public social graph.
2. **Human controlled memory.** The user explicitly chooses what becomes a Moment, date, or plan. Private is the default.
3. **Messaging remains dependable and free.** Kin+ never blocks ordinary conversation or removes access to existing saved history.
4. **No silent data behavior.** Auth, sharing, deletion, blocking, billing, and notification outcomes are explicit.
5. **Graceful failure.** Existing content remains readable during recoverable network failure, and every failed mutation offers one clear next action.
6. **Honest environments.** Demo, development, preview, and production are explicit build profiles with validation; no environment impersonates another.

## 5. Identity and session design

### Authentication

Production mode opens on a warm, product-led sign-in screen. The user enters an email address, receives a six-digit OTP, and verifies it in-app. OTP is selected over password auth to reduce reset/support burden and over magic-link-only auth to keep the primary flow reliable across webmail and device boundaries.

The auth state machine is:

1. boot and restore session;
2. unauthenticated welcome;
3. email entry;
4. OTP verification with resend countdown and change-email action;
5. authenticated profile check;
6. profile creation when missing;
7. pending invite redemption when present;
8. Chats.

Authentication errors use product copy rather than raw provider messages. Rate limits, expired OTPs, offline attempts, duplicate submissions, and interrupted deep links have dedicated recovery states.

### Session and user identity

- Supabase Auth user ID is the canonical user ID everywhere.
- AsyncStorage persists the Supabase session on native and the supported secure browser storage path is used on web.
- RevenueCat is configured with the same Supabase user ID on every platform and logs out when the Supabase session ends.
- Incoming invite URLs are retained through authentication and redeemed only after a profile exists.
- Demo mode uses a separate repository and demo entitlement, never a production Supabase user.

### Account controls

Profile settings provide:

- edit display name and avatar;
- notification preferences;
- subscription status and management;
- privacy policy, terms, community standards, and support;
- export my data;
- sign out;
- delete my account.

Account deletion requires a fresh OTP confirmation. The authenticated deletion function removes the auth user and user-owned private data, applies the documented shared-history policy, deletes owned media, invalidates push tokens, and detaches RevenueCat identity. Completion signs out locally and presents a final confirmation.

## 6. Kin Space lifecycle

### Create

Space creation asks for the other person's display name and optional relationship start date. One transactional database function creates the Space, owner membership, preferences, and first invitation. A partial Space is never visible.

The result screen provides:

- a tappable HTTPS invite link;
- the short fallback code;
- native Share sheet access;
- expiry and use state;
- regenerate/revoke controls;
- a clear waiting-for-your-person state.

### Join

Users may open an invite link or enter a code. The server atomically validates expiry, usage, block state, existing membership, and the two-member limit. A successful join invalidates the invitation and opens the Space. A failed join preserves the code and explains whether it expired, was already used, belongs to the same account, or is unavailable.

### Archive, leave, block, and report

- **Archive** hides the Space for one user and is reversible.
- **Leave** removes future access and messaging for that user after a clear confirmation. The user is told what happens to private and shared history.
- **Block** prevents new messages and future reconnection between the same users. Existing history remains available according to the deletion policy until the user removes it.
- **Report** lets a user submit a message or Space report with a category and optional explanation. Reports are stored server-side for developer review, and the UI always exposes support contact information.

Blocking and reporting satisfy the consumer-safety behavior required for an app that displays user-generated messages. Kin does not attempt automated content analysis in this release.

## 7. Messaging and media

### Conversation behavior

- newest messages load first with cursor pagination for older history;
- sending is optimistic with stable client-generated IDs;
- database insertion is idempotent;
- failed sends remain visible with retry and remove actions;
- realtime events reconcile rather than duplicate optimistic messages;
- the conversation indicates offline, reconnecting, and restored states;
- new messages from the other user update the list preview and unread count;
- opening a Space clears its unread count;
- timestamps are localized and date separators remain stable;
- keyboard, safe-area, reduced-motion, large-text, and screen-reader behavior are verified on native devices.

Read receipts and typing indicators remain out of scope.

### Images, avatars, and stickers

- selected photos are resized/compressed before upload and validated for supported type and maximum size;
- camera/library permission denial leaves text messaging fully usable;
- avatars are uploaded to the private avatar bucket before their profile path is stored;
- chat and memory media use opaque storage paths scoped by Space and uploader;
- signed URL refresh does not overwrite durable storage paths;
- deleting a failed message or user-owned memory removes unreferenced objects;
- deleting an account cleans up remaining owned objects;
- bundled stickers have useful accessibility labels and do not request microphone access.

### Notifications

- permission is requested contextually after the first successful Space connection, not during first launch;
- Expo push tokens are stored per installation with platform and last-seen metadata;
- message inserts enqueue a push only for the other active member;
- notification bodies respect the user's preview preference;
- tapping a notification deep-links into the correct Space after auth restoration;
- sign-out, token rollover, block, leave, and account deletion deactivate the token;
- delivery failures are logged without blocking the message.

## 8. Memories and privacy

Remember this preserves the existing deliberate editor and kind choices. Production completion adds:

- strict required-field and date validation before network submission;
- idempotent memory creation and source linking in one server transaction;
- edit/delete authorization enforced in RLS and server functions;
- private memories readable only by their creator;
- shared memories readable only by active Space members;
- server-enforced free-memory creation limit based on a verified Kin+ entitlement;
- stable source-message context even when the original sender leaves, subject to deletion policy;
- media cleanup when a memory is deleted or upload fails;
- pagination for Moments and relationship timelines.

Kin never silently changes a memory from private to shared. Visibility changes require an explicit selection and confirmation copy.

## 9. Billing

Kin+ retains the approved value proposition: relationship themes and unlimited new Moments. Messaging and existing Moments remain free.

- RevenueCat uses platform-specific public SDK keys for iOS, Android, and web.
- All platforms use the Supabase user ID as the RevenueCat App User ID.
- Products and offerings are dashboard-configured; the app never hard-codes prices.
- Web purchases use RevenueCat Web Billing and the same entitlement.
- Native purchases use the App Store and Google Play products.
- Restore remains visible even when no offering loads.
- Purchase cancellation is quiet; actual failures offer retry.
- Subscription management opens the appropriate platform/customer portal.
- RevenueCat webhooks update a server-side entitlement projection.
- premium memory creation is enforced on the server, not only in the client.
- demo builds expose a clearly labelled free demo entitlement; production builds never fall back to it.

## 10. Data and backend design

### Database additions and changes

The production migration introduces or evolves:

- authenticated profiles with notification and lifecycle metadata;
- active/left membership state and two-person Space enforcement;
- revocable invitations with safe redemption functions;
- user blocks;
- content reports;
- installation push tokens;
- unread cursors or per-member last-read timestamps;
- server entitlement projection;
- idempotency metadata for messages and memories;
- database functions for atomic Space creation, invite redemption, leaving/blocking, memory creation, export preparation, and account cleanup.

Existing data remains migratable. Destructive migration steps require a backup and explicit verification query.

### Authorization

Every public table and storage bucket remains behind RLS. Automated database tests prove at minimum:

- strangers cannot read profiles, Spaces, messages, media, or shared memories;
- a member cannot access a Space after leaving or blocking according to policy;
- private memories remain creator-only;
- users cannot spoof sender, creator, membership, entitlement, report author, or push-token owner;
- invite redemption cannot exceed two members or bypass expiry/revocation/block state;
- premium limits cannot be bypassed with direct API calls;
- account cleanup cannot delete another user's private data.

Security-definer functions use a fixed search path, revoke public execution, validate `auth.uid()`, and expose only the minimum authenticated grants.

### Edge Functions

Edge Functions handle operations that require secrets or privileged auth administration:

- send message notifications;
- receive and verify RevenueCat webhooks;
- export the authenticated user's data;
- delete the authenticated account and associated private resources;
- submit reports or notify the developer when operationally necessary.

Secrets remain in Supabase/EAS secret stores and never use `EXPO_PUBLIC_` names.

## 11. UI completion contract

Every screen must meet the following matrix before release:

| Surface | Required complete states |
| --- | --- |
| Boot | font/session loading, offline restoration, fatal configuration error |
| Welcome/auth | email entry, OTP entry, resend, expired/invalid/rate-limited/offline |
| Onboarding/profile | empty, validation, avatar permission/upload, save failure, success |
| Chats | empty, populated, unread, archived restoration, offline/reconnecting, new Space |
| Create/join | create, share invite, pending partner, code join, deep-link join, all invalid states |
| Conversation | initial load, pagination, text/image/sticker, reaction, retry/remove, offline, blocked/left |
| Relationship | empty upcoming/recent, populated, personalization, safety actions |
| Remember editor | all kinds, validation, visibility, free limit, upload/save failure, success |
| Moments/timeline | empty, populated, pagination, On This Day, open detail |
| Moment detail | source context, edit, delete confirmation, missing/deleted source |
| Kin+ | offering load, monthly/annual/web packages, purchase, cancellation, failure, active, restore, manage |
| Profile/settings | edit, notifications, archive, subscription, legal, support, export, sign-out, delete account |
| Global | 404/deep-link failure, no network, maintenance, recoverable server error |

The existing parchment, plum, rose, editorial typography, botanical paper, and kept-corner motif remain the visual system. New settings and operational screens use the same materials and hierarchy rather than generic platform-default cards.

All interactive targets are at least 44 points, focus order is logical, icon-only controls have labels, text scaling does not clip critical actions, color contrast passes, reduced motion is honored, and responsive layouts are checked at phone, tablet, narrow web, and wide web widths.

## 12. Environment and developer experience

Four explicit profiles are supported:

- **demo:** deterministic local data and labelled demo Kin+;
- **development:** local or hosted development Supabase plus development client;
- **preview:** hosted staging services and internal-distribution builds;
- **production:** hosted production services, real billing, monitoring, and store builds.

Required developer artifacts include:

- typed, fail-fast environment parsing;
- `.env.example` with purpose and provenance for every public value;
- EAS environment variables/secrets documentation;
- `eas.json` development, preview, production, and submission profiles;
- app identifiers, version/build-number strategy, runtime version, update channel policy, permissions, associated domains, and intent filters;
- generated Supabase database types and drift check;
- one-command unit/integration verification;
- local Supabase database test command;
- E2E commands for demo and connected staging flows;
- CI for typecheck, lint, unit/acceptance tests, database tests, web export, E2E smoke, and dependency audit policy;
- deployment, rollback, backup, incident, support/report review, and release runbooks.

Generated Expo files are either deliberately tracked or deliberately ignored so ordinary verification does not dirty the worktree.

## 13. Observability and privacy operations

The production app captures crashes and operational failures without recording message bodies, memory text, email addresses, invite codes, or private media URLs. Structured events may include anonymized user ID, platform, app version, operation, error class, and request correlation ID.

The developer must be able to:

- see client crashes and Edge Function failures;
- inspect failed push sends and billing webhook delivery;
- review user reports through an authenticated administrative path;
- revoke invites and disable abusive accounts using a documented runbook;
- back up and restore the database;
- roll back a web release and stop a bad native update;
- answer export/deletion/support requests.

No advertising or behavioral analytics SDK is added. Product analytics are omitted unless a later privacy-reviewed need is approved.

## 14. Verification and release gates

### Automated gates

- TypeScript and lint pass with zero errors.
- Unit, component, domain, repository, and acceptance suites pass.
- Supabase database tests pass from a clean local reset.
- Connected integration tests run against an isolated staging project with two real test users.
- Playwright covers auth, invite, messaging, remembering, rediscovery, billing-unavailable/recovery, settings, and destructive confirmations.
- Web export and production web smoke pass.
- EAS development and production builds succeed for iOS and Android.
- Dependency audit contains no unexplained high/critical issue; moderate issues are fixed, mitigated, or documented.
- `git diff --check` and a clean generated-file check pass.

### Manual device gates

On at least one physical iPhone and Android device:

- OTP authentication and session restoration;
- invite universal link and fallback code;
- two-device realtime send/receive/reaction;
- photo permission, upload, display, retry, and cleanup;
- notification permission, background receipt, tap routing, and preference suppression;
- keyboard/safe area, dynamic type, VoiceOver/TalkBack basics, haptics, and reduced motion;
- RevenueCat sandbox purchase, restore, cross-device identity, and management;
- leave/block/report/sign-out/account deletion.

### External gates

- production Supabase migration and secrets deployed;
- web release deployed to stable HTTPS and checked from a clean browser;
- privacy/terms/support URLs publicly reachable;
- Apple and Google products, subscription disclosures, screenshots, privacy declarations, age rating, and review notes prepared;
- production artifacts submitted to TestFlight and Google Play internal testing before public review;
- App Store/Play approval is tracked as external evidence and never inferred from a successful build.

## 15. Rollout sequence

1. Harden environments, app configuration, and developer verification.
2. Replace anonymous production identity with the OTP session flow.
3. Migrate backend lifecycle, atomic operations, RLS tests, and media correctness.
4. Complete invites, safety, settings, legal/support, and account lifecycle UI.
5. Add message pagination, connectivity handling, unread state, and push notifications.
6. Complete RevenueCat identity, web/native billing, webhook projection, and server limits.
7. Run the full visual, accessibility, responsive, and failure-state pass.
8. Configure staging/production services and deploy web.
9. Build and verify iOS/Android development and production artifacts.
10. Prepare store and Devpost materials, run final acceptance, and submit.

Each sequence item is implemented test-first and receives its own verification checkpoint. External credentials are requested only when the relevant dashboard or deployment step cannot proceed without them.

## 16. Required credentials, deferred until blocked

The implementation can proceed locally without credentials. The following will eventually be required:

- Supabase access/project ownership and production SMTP configuration;
- EAS project creation confirmation under the intended Expo account;
- Apple Developer/App Store Connect access;
- Google Play Console access plus Android FCM service-account credentials;
- RevenueCat project, iOS/Android/web public keys, products, and webhook secret;
- stable public domain choice for web, universal links, privacy, terms, and support;
- crash-monitoring DSN if an external monitoring provider is selected.

No service-role, store, SMTP, webhook, or monitoring secret is committed to the repository.
