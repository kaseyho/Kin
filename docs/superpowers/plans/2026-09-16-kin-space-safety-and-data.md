# Kin Space Safety and Data Implementation Plan

> **Execution note:** Follow this plan task-by-task with test-driven development. Do not begin the messaging/notification slice until the final verification checkpoint is green or an external Supabase gate is explicitly recorded.

**Goal:** Make one-to-one Kin Spaces transactional, invitation-driven, and safe to leave, block, and report across demo and connected modes.

**Architecture:** PostgreSQL owns all membership and invitation invariants through narrowly granted `security definer` functions. The repositories expose product-level results rather than raw database rows, while Expo Router owns pending invite handoff through authentication. The UI keeps archive, leave, block, report, invitation sharing, and demo-only deletion semantically distinct.

**Stack:** Expo 57, Expo Router, React Native, TypeScript, Supabase Postgres/RLS/Storage, Jest, Testing Library, Playwright, pgTAP/SQL assertions.

**Approved product constraints:** A Space has at most two active members. Invites expire, can be revoked or regenerated, and are single-use. Leaving ends future access. Blocking also prevents future reconnection. Reports are retained for developer review. Existing shared history remains with the remaining member; a leaver loses access. Automated content analysis is out of scope.

---

## Task 1: Define the Space lifecycle contract

**Files:**

- Modify: `src/domain/models.ts`
- Modify: `src/data/contracts.ts`
- Modify: `src/data/errors.ts`
- Modify: `src/data/supabase/mappers.ts`
- Modify: `src/data/supabase/database.types.ts`
- Test: `src/data/supabase/__tests__/mappers.test.ts`
- Test: `src/data/__tests__/spaceLifecycleContracts.test.ts`

### Step 1: Write failing contract tests

Cover these product shapes:

- `SpaceInvitation` exposes `id`, `spaceId`, `code`, `expiresAt`, `revokedAt`, `useCount`, `maxUses`, and derived status;
- `KinSpace` contains `activeInvitation` instead of treating a possibly stale code as the invitation lifecycle;
- report categories are a closed union: `harassment`, `threats`, `hate`, `sexual_content`, `spam`, `other`;
- repository operations exist for invitation rotation/revocation, leaving, blocking, and reporting;
- stable error codes distinguish expired, revoked, used, full, self, blocked, and already-member invitation failures.

Run: `npm test -- --runTestsByPath src/data/supabase/__tests__/mappers.test.ts src/data/__tests__/spaceLifecycleContracts.test.ts`

Expected: FAIL because the lifecycle types and mappings do not exist.

### Step 2: Add the minimum domain and repository types

Add:

```ts
export type InvitationStatus = 'active' | 'expired' | 'revoked' | 'used';

export interface SpaceInvitation {
  id: Id;
  spaceId: Id;
  code: string;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  revokedAt?: ISODateTime;
  useCount: number;
  maxUses: number;
  status: InvitationStatus;
}
```

Add repository inputs for `rotateSpaceInvite`, `revokeSpaceInvite`, `leaveSpace`, `blockSpaceMember`, and `submitContentReport`. Mutation inputs must infer the current authenticated user inside the repository; never accept a caller-supplied actor ID in connected mode.

### Step 3: Map durable invite rows

Expand `InviteRow`, update `mapSpace`, and preserve an `inviteCode` compatibility accessor only while current UI tests migrate. No mapper may label an expired, revoked, or used invitation active.

### Step 4: Run tests and typecheck

Run: `npm test -- --runTestsByPath src/data/supabase/__tests__/mappers.test.ts src/data/__tests__/spaceLifecycleContracts.test.ts && npm run typecheck`

Expected: PASS.

### Step 5: Commit

```bash
git add src/domain/models.ts src/data/contracts.ts src/data/errors.ts src/data/supabase/mappers.ts src/data/supabase/database.types.ts src/data/supabase/__tests__/mappers.test.ts src/data/__tests__/spaceLifecycleContracts.test.ts
git commit -m "feat: define Kin Space lifecycle contracts"
```

---

## Task 2: Enforce atomic one-to-one Spaces in PostgreSQL

**Files:**

- Create: `supabase/migrations/202609160002_space_safety_lifecycle.sql`
- Modify: `supabase/tests/rls.sql`
- Create: `supabase/tests/space_lifecycle.sql`
- Modify: `src/data/supabase/database.types.ts`
- Modify: `package.json`
- Modify: `.github/workflows/quality.yml`
- Create: `scripts/verify-supabase.mjs`

### Step 1: Write failing SQL assertions first

Add fixtures for three authenticated users and assert:

- `create_kin_space` creates the Space, owner membership, owner theme, and first invite as one unit;
- the actor cannot spoof `created_by` or owner membership;
- one active owner and one active member may coexist, but a third active member cannot be inserted directly or through an invite;
- an invite cannot be redeemed by its creator, after expiry, after revocation, twice, or across an existing block;
- concurrent redemption serializes on the invitation/Space and cannot exceed two active members;
- a stranger cannot read profiles, membership, Space data, invite state, messages, memories, or storage paths;
- a private memory remains creator-only;
- functions are executable only by `authenticated` unless explicitly service-only.

Run: `npm run test:database`

Expected: FAIL because the migration and verification command do not exist.

### Step 2: Add lifecycle columns and safety tables

Evolve membership with `left_at timestamptz` and treat only `left_at is null` as active. Add:

- `revoked_at timestamptz` and `redeemed_by uuid` to `space_invites`;
- `user_blocks(blocker_id, blocked_id, space_id, created_at)` with no self-block and unique active pair per Space;
- `content_reports(id, reporter_id, reported_user_id, space_id, message_id, category, explanation, status, created_at)` with constrained category/status and immutable reporter;
- indexes for active memberships, active invitations, blocks, and report review.

Keep report rows available to `service_role`; authenticated users may insert their own report and read only their own submission receipt.

### Step 3: Add hardened database functions

Implement, lock, revoke, and narrowly grant:

- `create_kin_space(other_display_name text, relationship_start_date date)`;
- `redeem_space_invite(invite_code text)` returning explicit machine status or raising documented SQLSTATE/detail codes;
- `rotate_space_invite(target_space_id uuid)`;
- `revoke_space_invite(target_space_id uuid)`;
- `leave_kin_space(target_space_id uuid)`;
- `block_kin_space_member(target_space_id uuid)`;
- `submit_content_report(target_space_id uuid, target_message_id uuid, report_category text, report_explanation text)`.

All functions must:

- use `security definer set search_path = public, pg_temp`;
- validate `auth.uid()` and active membership;
- acquire row locks before checking cardinality or invite state;
- derive actor, target user, and ownership on the server;
- never return private report data or another user's identifiers unnecessarily.

Add a trigger-level active-member cap so direct table writes cannot bypass the RPC invariant.

### Step 4: Update RLS for active membership and block semantics

Replace helper logic so data access requires an active membership. A leaver immediately loses reads/writes and signed-media access. Blocked users keep no active relationship access; the remaining participant retains shared history. Preserve creator-only private memories.

### Step 5: Add deterministic database verification

`scripts/verify-supabase.mjs` must:

- fail clearly when invoked without Docker/Supabase prerequisites;
- run `supabase start`, `supabase db reset`, `supabase test db`, and stop only the project it started;
- accept `KIN_SKIP_SUPABASE_STOP=1` for local diagnosis;
- never treat missing Docker as a passing database test.

Add `test:database` and a separate GitHub Actions `database` job using the current Supabase CLI. Keep the regular Node job independent so database diagnostics are not hidden by application failures.

### Step 6: Run available checks

Run: `npm run typecheck && git diff --check`

Run when Docker is available: `npm run test:database`

Expected: application checks PASS. Database checks PASS where Docker is available; otherwise record the exact external verification gate without weakening CI.

### Step 7: Commit

```bash
git add supabase/migrations/202609160002_space_safety_lifecycle.sql supabase/tests/rls.sql supabase/tests/space_lifecycle.sql src/data/supabase/database.types.ts scripts/verify-supabase.mjs package.json .github/workflows/quality.yml
git commit -m "feat: enforce safe one-to-one Spaces"
```

---

## Task 3: Use the atomic lifecycle from both repositories

**Files:**

- Modify: `src/data/supabase/SupabaseKinRepository.ts`
- Modify: `src/data/demo/DemoKinRepository.ts`
- Modify: `src/data/demo/seed.ts`
- Modify: `src/data/supabase/database.types.ts`
- Modify: `src/state/KinProvider.tsx`
- Test: `src/data/supabase/__tests__/SupabaseKinRepository.test.ts`
- Modify: `src/data/demo/__tests__/DemoKinRepository.test.ts`
- Test: `src/state/__tests__/KinProvider.test.tsx`

### Step 1: Write failing repository tests

Assert:

- connected creation makes exactly one `create_kin_space` RPC and never performs client-side Space/member/theme/invite inserts;
- joined Spaces surface the server-created relationship preference;
- database invitation failures map to stable product messages without provider details;
- rotate/revoke/leave/block/report call the correct RPC with no actor ID;
- leaving/blocking refreshes the local snapshot so the route becomes unavailable;
- demo mode enforces identical observable two-person, invite, leave, block, and report behavior;
- demo report content is retained locally for developer inspection but never shown to the other demo profile.

Run: `npm test -- --runTestsByPath src/data/supabase/__tests__/SupabaseKinRepository.test.ts src/data/demo/__tests__/DemoKinRepository.test.ts src/state/__tests__/KinProvider.test.tsx`

Expected: FAIL.

### Step 2: Replace multi-write creation and post-join theme write

Call only the atomic RPCs. Refresh after success. Map Supabase function error details to `RepositoryError` codes and product copy. Remove `makeInviteCode` from the connected repository.

### Step 3: Implement demo parity

Use deterministic in-memory invitation timestamps and statuses. A demo Space created for the story may remain pre-connected; a newly created Space begins with only the current member and an active invite so invitation UI is honest.

### Step 4: Expose lifecycle methods through `KinProvider`

Keep the state surface thin. It delegates to the repository and contains no safety or authorization rules.

### Step 5: Run tests

Run: `npm test -- --runTestsByPath src/data/supabase/__tests__/SupabaseKinRepository.test.ts src/data/demo/__tests__/DemoKinRepository.test.ts src/state/__tests__/KinProvider.test.tsx && npm run typecheck`

Expected: PASS.

### Step 6: Commit

```bash
git add src/data/supabase/SupabaseKinRepository.ts src/data/demo/DemoKinRepository.ts src/data/demo/seed.ts src/data/supabase/database.types.ts src/state/KinProvider.tsx src/data/supabase/__tests__/SupabaseKinRepository.test.ts src/data/demo/__tests__/DemoKinRepository.test.ts src/state/__tests__/KinProvider.test.tsx
git commit -m "feat: connect Kin Space lifecycle operations"
```

---

## Task 4: Deliver invitation links and auth-safe handoff

**Files:**

- Modify: `src/config/environment.ts`
- Modify: `src/config/__tests__/environment.test.ts`
- Modify: `.env.example`
- Modify: `scripts/verify-environment.mjs`
- Modify: `app.config.ts`
- Create: `src/features/invitations/inviteLinks.ts`
- Test: `src/features/invitations/__tests__/inviteLinks.test.ts`
- Create: `src/features/invitations/pendingInvite.ts`
- Test: `src/features/invitations/__tests__/pendingInvite.test.ts`
- Create: `src/features/invitations/InvitationScreen.tsx`
- Test: `src/features/invitations/__tests__/InvitationScreen.test.tsx`
- Create: `app/invite/[code].tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/auth.tsx`
- Modify: `app/onboarding.tsx`
- Modify: `src/features/spaces/CreateJoinSpaceScreen.tsx`
- Test: `src/features/spaces/__tests__/CreateJoinSpaceScreen.test.tsx`

### Step 1: Write failing URL/config tests

Require `EXPO_PUBLIC_KIN_PUBLIC_URL` for preview and production, allow loopback HTTP only in development, and use a clearly non-production demo URL in demo builds. Normalize URLs without query/hash/trailing slash. Assert invite URLs encode only the invitation code.

Run: `npm test -- --runTestsByPath src/config/__tests__/environment.test.ts src/features/invitations/__tests__/inviteLinks.test.ts`

Expected: FAIL.

### Step 2: Add public URL environment contract

Expose `publicAppUrl` through `KinEnvironment`, EAS fixtures, and developer documentation. Configure Expo scheme support now. Add iOS associated domains and Android intent filters only once the real HTTPS host is known; until then web links must still provide a working page and the short code remains the native fallback.

### Step 3: Persist pending invitations through auth/profile setup

Store one normalized pending invite code in AsyncStorage. The invite route:

- validates the path shape;
- stores the code before redirecting a signed-out user to auth;
- preserves it while profile onboarding completes;
- redeems it exactly once after a profile exists;
- leaves it available after recoverable failure;
- clears it after success or explicit dismissal.

### Step 4: Build the invitation result/waiting UI

After creation, show the HTTPS link, fallback code, expiry/use state, native Share sheet, copy action, regenerate, and revoke. If a partner has joined, show the connected state and remove stale sharing controls.

Use `Share.share` on native and Web Share API with clipboard fallback on web. Never claim that a copy/share succeeded when the platform call failed.

### Step 5: Run focused tests and export

Run: `npm test -- --runTestsByPath src/config/__tests__/environment.test.ts src/features/invitations/__tests__/inviteLinks.test.ts src/features/invitations/__tests__/pendingInvite.test.ts src/features/invitations/__tests__/InvitationScreen.test.tsx src/features/spaces/__tests__/CreateJoinSpaceScreen.test.tsx && npm run typecheck && npm run export:web:demo`

Expected: PASS.

### Step 6: Commit

```bash
git add src/config/environment.ts src/config/__tests__/environment.test.ts .env.example scripts/verify-environment.mjs app.config.ts src/features/invitations app/invite app/_layout.tsx app/auth.tsx app/onboarding.tsx src/features/spaces/CreateJoinSpaceScreen.tsx src/features/spaces/__tests__/CreateJoinSpaceScreen.test.tsx
git commit -m "feat: add durable Kin Space invitations"
```

---

## Task 5: Complete consumer safety controls

**Files:**

- Modify: `src/features/spaces/SpaceSafetyActions.tsx`
- Test: `src/features/spaces/__tests__/SpaceSafetyActions.test.tsx`
- Modify: `src/features/spaces/RelationshipPanel.tsx`
- Create: `src/features/safety/ReportSheet.tsx`
- Test: `src/features/safety/__tests__/ReportSheet.test.tsx`
- Modify: `src/features/chat/MessageBubble.tsx`
- Modify: `src/features/chat/ConversationScreen.tsx`
- Test: `src/features/chat/__tests__/ConversationScreen.test.tsx`
- Modify: `src/features/profile/ProfileScreen.tsx`

### Step 1: Write failing safety-flow tests

Assert:

- archive remains reversible and clearly described;
- connected mode shows Leave, Block, and Report, never the demo-only local-delete action;
- demo local deletion remains explicitly device-only;
- Leave requires a plain-language consequence confirmation;
- Block requires confirmation, names its messaging/reconnection effect, and routes away after success;
- Report requires a category, accepts a bounded optional explanation, may target a Space or message, and returns a receipt state;
- message actions expose Report without exposing another user's IDs in visible copy;
- support contact remains visible alongside reporting.

Run: `npm test -- --runTestsByPath src/features/spaces/__tests__/SpaceSafetyActions.test.tsx src/features/safety/__tests__/ReportSheet.test.tsx src/features/chat/__tests__/ConversationScreen.test.tsx`

Expected: FAIL.

### Step 2: Replace the misleading connected deletion action

Render controls by repository mode. Connected mode gets Leave and Block. Demo mode keeps the current local deletion with `DELETE` confirmation. Both modes keep archive.

### Step 3: Add accessible report flow

Use a full-screen/sheet flow with labelled category choices, explanation character count, submit progress, retry state, cancel, and a completion receipt. Add message-level entry and Space-level entry.

### Step 4: Add support access

Link to the support address defined by the legal/support slice. If that slice has not landed yet, use the canonical checked-in support constant and create a follow-up migration point; do not hard-code different addresses across screens.

### Step 5: Run focused tests

Run: `npm test -- --runTestsByPath src/features/spaces/__tests__/SpaceSafetyActions.test.tsx src/features/safety/__tests__/ReportSheet.test.tsx src/features/chat/__tests__/ConversationScreen.test.tsx && npm run typecheck`

Expected: PASS.

### Step 6: Commit

```bash
git add src/features/spaces/SpaceSafetyActions.tsx src/features/spaces/__tests__/SpaceSafetyActions.test.tsx src/features/spaces/RelationshipPanel.tsx src/features/safety src/features/chat/MessageBubble.tsx src/features/chat/ConversationScreen.tsx src/features/chat/__tests__/ConversationScreen.test.tsx src/features/profile/ProfileScreen.tsx
git commit -m "feat: complete Kin Space safety controls"
```

---

## Task 6: Prove cleanup, access loss, and end-to-end behavior

**Files:**

- Modify: `supabase/functions/delete-account/index.ts`
- Modify: `supabase/functions/_shared` as needed
- Modify: `supabase/tests/space_lifecycle.sql`
- Modify: `e2e/kin.spec.ts`
- Create: `docs/runbooks/space-safety.md`
- Modify: `docs/runbooks/development.md`

### Step 1: Write failing cleanup and browser assertions

Cover:

- leave/block immediately removes the Space from current navigation;
- an active invite URL survives sign-in routing in a connected test adapter;
- a demo user can create, share/copy, revoke, regenerate, and observe invitation state;
- account deletion also removes the user's block rows, authored pending invites, reports according to retention policy, and owned unreferenced media;
- remaining members cannot access the leaver's private memories;
- leavers cannot mint signed media URLs or write messages after access loss.

### Step 2: Complete cleanup policy

Document and implement:

- shared Space content remains with the active member;
- private memories owned by a leaving user are removed from the Space data path;
- report evidence is retained server-side for a documented moderation period and excluded from normal account export/UI reads;
- block rows survive as pseudonymous safety enforcement until account deletion policy removes or rekeys them;
- unused invitations are revoked when ownership changes or the last member leaves;
- unreferenced user-owned media is deleted by privileged cleanup, with failures logged for retry.

### Step 3: Add the developer moderation/readiness runbook

Document:

- how to inspect open reports safely with service-role tooling;
- report status transitions and retention;
- invite diagnosis without exposing codes in logs;
- SQL/RLS verification commands;
- local Docker requirement;
- remote Supabase smoke steps for two accounts, a third-account cap attempt, expiry/revoke, leave, block, report, Storage access loss, and account cleanup.

### Step 4: Run the subsystem verification gate

Run:

```bash
npm run verify:ci
npm run e2e
npm run test:database
git diff --check
```

Expected: all available gates PASS. If hosted Supabase credentials or Docker are unavailable, local app proof may pass but the subsystem remains externally unverified; record the exact command and expected evidence in the runbook.

### Step 5: Commit

```bash
git add supabase/functions supabase/tests e2e/kin.spec.ts docs/runbooks/space-safety.md docs/runbooks/development.md
git commit -m "test: verify Kin Space safety lifecycle"
```

---

## Completion criteria

This plan is complete only when:

- connected Space creation cannot leave partial rows;
- direct writes and concurrent invitation redemption cannot exceed two active members;
- expiry, revocation, use, self-join, existing membership, and block failures are distinct and recoverable;
- HTTPS invite links and short codes survive auth/profile handoff;
- archive, leave, block, report, and demo-only deletion all have complete and truthful UI outcomes;
- leaving/blocking removes future database and Storage access;
- report data is private from reported users and inspectable by the developer;
- application, browser, SQL/RLS, migration, and static checks pass;
- any remote-provider gate is documented without being represented as locally proven.
