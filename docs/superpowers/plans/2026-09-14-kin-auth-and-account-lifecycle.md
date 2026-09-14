# Kin Authentication and Account Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unrecoverable anonymous production identity with email OTP sessions and complete the consumer profile, sign-out, export, and account-deletion lifecycle.

**Architecture:** A platform-neutral `AuthService` wraps Supabase Auth and publishes a small state machine through `AuthProvider`. The app runtime constructs one Supabase client shared by auth and the connected repository, while `KinProvider` stays inactive until a connected session exists. Expo Router protected screens and an unprotected index route preserve intended deep links through auth; privileged export/deletion operations use authenticated Supabase Edge Functions.

**Tech Stack:** Expo SDK 57, Expo Router protected routes, React Native 0.86, Supabase Auth/Edge Functions, TypeScript 6, Jest, React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-09-14-kin-production-readiness-design.md`

## Global Constraints

- Email uses a six-digit OTP entered in-app; production connected mode never creates anonymous users.
- Supabase Auth user ID is the canonical user and later RevenueCat App User ID.
- Demo mode remains credential-free and bypasses connected authentication without impersonating it.
- Private content never appears before session restoration completes.
- User-facing errors use stable Kin copy and never append raw provider messages.
- Account deletion requires a freshly verified OTP and documents the shared-history outcome.
- Runtime changes use strict red-green-refactor with a focused commit per task.
- Continue on the user-selected `main` branch and preserve unrelated changes.

## File Structure

- `src/services/auth/contracts.ts` — auth state, errors, user shape, and service port.
- `src/services/auth/demo.ts` — explicit demo auth state.
- `src/services/auth/supabase.ts` — OTP/session adapter over one supplied Supabase client.
- `src/services/auth/__tests__/supabase.test.ts` — adapter behavior with a narrow complete auth double.
- `src/data/supabase/requireAuthenticatedUser.ts` — repository defense that never signs in anonymously.
- `src/data/supabase/__tests__/requireAuthenticatedUser.test.ts` — signed-in and signed-out behavior.
- `src/state/AuthProvider.tsx`, `src/state/useAuth.ts` — reactive app auth state/actions.
- `src/state/__tests__/AuthProvider.test.tsx` — load, event, and action behavior.
- `src/state/KinProvider.tsx` — active/inactive lifecycle bound to auth.
- `src/bootstrap/createAppRuntime.ts` — constructs shared connected client plus auth/repository/billing services.
- `src/features/auth/AuthScreen.tsx` — email and six-digit OTP experience.
- `src/features/auth/__tests__/AuthScreen.test.tsx` — validation, request, verify, resend, and provider failure states.
- `app/auth.tsx` — auth route.
- `app/_layout.tsx` — provider order and protected route declarations.
- `app/index.tsx` — session/profile-aware initial route.
- `src/features/profile/ProfileScreen.tsx` — profile editing and account actions.
- `src/features/profile/AccountActions.tsx` — sign-out, export, and destructive deletion confirmation.
- `supabase/functions/export-account/index.ts` — authenticated JSON export.
- `supabase/functions/delete-account/index.ts` — fresh-session account cleanup and auth deletion.
- `supabase/functions/_shared/http.ts` — CORS, auth header, and safe JSON response helpers.
- `docs/runbooks/account-operations.md` — export/deletion behavior and support recovery.

---

### Task 1: Define recoverable auth and remove anonymous repository fallback

**Files:**
- Create: `src/services/auth/contracts.ts`
- Create: `src/services/auth/demo.ts`
- Create: `src/services/auth/supabase.ts`
- Create: `src/services/auth/__tests__/supabase.test.ts`
- Create: `src/data/supabase/requireAuthenticatedUser.ts`
- Create: `src/data/supabase/__tests__/requireAuthenticatedUser.test.ts`
- Modify: `src/data/supabase/SupabaseKinRepository.ts`

**Interfaces:**
- Produces: `AuthUser { id: string; email: string }`.
- Produces: `AuthState = { status: 'loading' } | { status: 'demo' } | { status: 'signed-out' } | { status: 'signed-in'; user: AuthUser }`.
- Produces: `AuthService` with `load`, `subscribe`, `requestOtp`, `verifyOtp`, and `signOut`.
- Produces: `AuthError` codes `invalid_email | invalid_otp | expired_otp | rate_limited | offline | unavailable`.
- Produces: `requireAuthenticatedUserId(auth): Promise<string>`.

- [ ] **Step 1: Write failing repository-auth defense tests**

```ts
it('returns the existing authenticated user ID', async () => {
  await expect(requireAuthenticatedUserId({
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  })).resolves.toBe('user-1');
});

it('rejects a missing session instead of creating an anonymous user', async () => {
  await expect(requireAuthenticatedUserId({
    getUser: async () => ({ data: { user: null }, error: null }),
  })).rejects.toMatchObject({ code: 'auth_required' });
});
```

Run: `npm test -- src/data/supabase/__tests__/requireAuthenticatedUser.test.ts --runInBand`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement the narrow repository defense and use it everywhere**

The helper accepts only a `getUser` capability, returns `data.user.id`, and otherwise throws `RepositoryError('auth_required', 'Sign in to use connected Kin.', 'reconnect')`. Replace `ensureUserId` in `SupabaseKinRepository` with this helper and delete `signInAnonymously` entirely.

Run: `rg -n "signInAnonymously" src`

Expected: no matches.

- [ ] **Step 3: Write failing Supabase auth adapter tests**

Use a complete narrow fake for `getSession`, `onAuthStateChange`, `signInWithOtp`, `verifyOtp`, and `signOut`. Assert real adapter results:

```ts
expect(await service.load()).toEqual({
  status: 'signed-in',
  user: { id: 'user-1', email: 'maya@example.com' },
});

await service.requestOtp('  Maya@Example.com ');
expect(fake.lastOtpRequest).toEqual({
  email: 'maya@example.com',
  options: { shouldCreateUser: true },
});

await expect(service.verifyOtp('maya@example.com', '123456')).resolves.toEqual({
  id: 'user-1',
  email: 'maya@example.com',
});
```

Separate cases prove missing session becomes `signed-out`, invalid six-digit input is rejected before a provider call, provider 429 maps to `rate_limited`, an expired token maps to `expired_otp`, and sign-out errors map to `unavailable` without exposing provider text.

Run: `npm test -- src/services/auth/__tests__/supabase.test.ts --runInBand`

Expected: FAIL because the auth contracts and adapter do not exist.

- [ ] **Step 4: Implement auth contracts, stable error mapping, and demo service**

Normalize email with `trim().toLowerCase()`. Validate with a conservative `^[^\s@]+@[^\s@]+\.[^\s@]+$` check and OTP with `^\d{6}$`. Call:

```ts
client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
client.auth.verifyOtp({ email, token, type: 'email' });
client.auth.signOut();
```

`onAuthStateChange` maps the supplied session and returns the subscription's `unsubscribe`. The demo service always loads `{ status: 'demo' }`; connected-only methods throw `AuthError('unavailable', 'This action is unavailable in the Kin demo.')`.

- [ ] **Step 5: Verify the complete task**

Run: `npm test -- src/services/auth/__tests__/supabase.test.ts src/data/supabase/__tests__/requireAuthenticatedUser.test.ts --runInBand`

Expected: PASS.

Run: `npm run typecheck && npm test -- --runInBand`

Expected: all suites pass.

- [ ] **Step 6: Commit the auth boundary**

```bash
git add src/services/auth src/data/supabase/SupabaseKinRepository.ts src/data/supabase/requireAuthenticatedUser.ts src/data/supabase/__tests__/requireAuthenticatedUser.test.ts
git commit -m "feat: replace anonymous identity with recoverable auth"
```

---

### Task 2: Bind auth state to runtime and repository lifecycle

**Files:**
- Create: `src/state/AuthProvider.tsx`
- Create: `src/state/useAuth.ts`
- Create: `src/state/__tests__/AuthProvider.test.tsx`
- Modify: `src/bootstrap/createAppRuntime.ts`
- Modify: `src/bootstrap/__tests__/createAppRuntime.test.ts`
- Modify: `src/state/KinProvider.tsx`
- Modify: `src/state/__tests__/KinProvider.test.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `AuthService` from Task 1.
- Extends ready `AppRuntime` with `authService: AuthService`.
- Produces: `AuthContextValue` exposing `state`, `requestOtp`, `verifyOtp`, and `signOut`.
- Extends `KinProvider` with `active?: boolean`; inactive status is `idle` and snapshot is cleared.

- [ ] **Step 1: Write failing provider lifecycle tests**

Cover initial `loading`, resolved `signed-out`, auth subscription events, request/verify pass-through, and safe unsubscription. Assert the rendered probe state rather than the fake's call count.

For KinProvider, render with `active={false}` and assert `idle:none`; rerender active and assert `ready:none`; rerender inactive and assert `idle:none`.

Run: `npm test -- src/state/__tests__/AuthProvider.test.tsx src/state/__tests__/KinProvider.test.tsx --runInBand`

Expected: FAIL because AuthProvider and inactive Kin status do not exist.

- [ ] **Step 2: Implement the providers**

AuthProvider subscribes before calling `load`, ignores results after unmount, and lets subscription events replace loaded state. KinProvider does not subscribe or load while inactive; moving inactive clears snapshot/error and returns to `idle`.

- [ ] **Step 3: Make runtime construct one connected Supabase client**

For demo, construct demo repository, demo auth, and demo premium services. For connected environments, construct one client through `createSupabaseClient`, then pass it to both `createSupabaseAuthService` and `createSupabaseKinRepository`. Preserve dependency injection in runtime tests and assert ready results contain all three exact service instances.

- [ ] **Step 4: Mount providers in auth-first order**

`app/_layout.tsx` mounts:

```tsx
<AuthProvider service={runtime.authService}>
  <AuthenticatedApp runtime={runtime} />
</AuthProvider>
```

`AuthenticatedApp` calls `useAuth`, activates Kin data for `demo` or `signed-in`, and then mounts PremiumProvider, KinProvider, status bar, and the router stack.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm test -- --runInBand && git diff --check`

Expected: all suites pass.

```bash
git add app/_layout.tsx src/bootstrap src/state/AuthProvider.tsx src/state/useAuth.ts src/state/__tests__/AuthProvider.test.tsx src/state/KinProvider.tsx src/state/__tests__/KinProvider.test.tsx
git commit -m "feat: bind Kin data to authenticated sessions"
```

---

### Task 3: Build the email OTP experience and protect routes

**Files:**
- Create: `src/features/auth/AuthScreen.tsx`
- Create: `src/features/auth/__tests__/AuthScreen.test.tsx`
- Create: `app/auth.tsx`
- Create: `src/navigation/resolveEntryRoute.ts`
- Create: `src/navigation/__tests__/resolveEntryRoute.test.ts`
- Modify: `app/_layout.tsx`
- Modify: `app/index.tsx`
- Modify: `app/onboarding.tsx`

**Interfaces:**
- Consumes: `useAuth()` and `useKin()`.
- Produces: `resolveEntryRoute({ authState, kinStatus, snapshot }): 'loading' | '/auth' | '/onboarding' | '/(tabs)/chats'`.
- `AuthScreen` takes optional `onSignedIn(): void`; the route replaces `/` on success.

- [ ] **Step 1: Write failing pure route-decision tests**

Literal cases prove loading auth never exposes content, signed-out connects to `/auth`, signed-in without a profile goes to `/onboarding`, signed-in with a profile goes to Chats, and demo preserves its existing empty/demo behavior.

Run: `npm test -- src/navigation/__tests__/resolveEntryRoute.test.ts --runInBand`

Expected: FAIL because the resolver does not exist.

- [ ] **Step 2: Implement the route resolver and use it from index**

The profile check is `snapshot.profiles.some(profile => profile.id === snapshot.currentUserId)`, not merely a non-null current user ID. Preserve the existing deterministic demo reset before applying the resolver.

- [ ] **Step 3: Write failing AuthScreen behavior tests**

Verify:

- invalid email shows `Enter a valid email address.` and stays on email step;
- valid email changes the heading to `Check your email` and keeps the normalized address visible;
- non-six-digit code shows `Enter the six-digit code.`;
- valid code calls the real context action and invokes `onSignedIn`;
- rate-limited request shows `Too many codes were requested. Wait a moment and try again.`;
- Back changes the email without discarding it;
- Resend is unavailable for 30 seconds and then requests a new code.

Run: `npm test -- src/features/auth/__tests__/AuthScreen.test.tsx --runInBand`

Expected: FAIL because the screen does not exist.

- [ ] **Step 4: Implement the two-step relationship-aligned auth screen**

Reuse parchment, plum, rose, display/body typography, 44-point targets, and KeyboardAvoidingView. Email fields use `autoCapitalize="none"`, `autoCorrect={false}`, `keyboardType="email-address"`, and `textContentType="emailAddress"`. OTP uses `keyboardType="number-pad"`, `maxLength={6}`, and `textContentType="oneTimeCode"`. Disable duplicate submissions and expose errors with `accessibilityRole="alert"`.

- [ ] **Step 5: Protect every non-index app route**

Use `Stack.Protected` with an auth route guard for `signed-out` and a product guard for `demo` or `signed-in`. Explicitly list `(tabs)`, `onboarding`, `kin-plus`, `moment/[momentId]`, `space/new`, `space/[spaceId]`, `space/[spaceId]/relationship`, and `space/[spaceId]/timeline`. Keep `index` always available to restore sessions and redirect.

- [ ] **Step 6: Verify and commit**

Run: `npm run verify:ci && npm run e2e`

Expected: all credential-free checks and the existing demo story pass.

```bash
git add app/_layout.tsx app/auth.tsx app/index.tsx app/onboarding.tsx src/features/auth src/navigation
git commit -m "feat: add recoverable email OTP sign in"
```

---

### Task 4: Complete profile editing and sign-out

**Files:**
- Create: `src/features/profile/EditProfileSheet.tsx`
- Create: `src/features/profile/__tests__/EditProfileSheet.test.tsx`
- Create: `src/features/profile/AccountActions.tsx`
- Create: `src/features/profile/__tests__/AccountActions.test.tsx`
- Modify: `src/features/profile/ProfileScreen.tsx`
- Modify: `app/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: existing `kin.saveProfile`, current profile, and `auth.signOut`.
- Produces: working Edit profile and Sign out controls.
- `AccountActions` receives `onExport`, `onDelete`, and `onSignedOut` hooks so privileged functions remain independently testable.

- [ ] **Step 1: Write failing edit-profile tests**

Open Edit profile, prove the existing name is prefilled, reject whitespace, save a changed name through the real demo repository, close only after success, and preserve input after a repository failure.

- [ ] **Step 2: Implement the edit sheet and expose it from Profile**

Use a labelled modal surface, explicit Cancel/Save controls, saving state, alert copy, and the existing profile styles. Avatar replacement is routed to the media/data plan because it must first upload a durable private object; do not present an avatar edit control until that behavior exists.

- [ ] **Step 3: Write failing sign-out tests**

The Sign out row opens a confirmation, Cancel preserves the session, and Confirm awaits `auth.signOut` before invoking `onSignedOut`. Failure leaves the confirmation open with `Kin could not sign you out. Try again.`

- [ ] **Step 4: Implement sign-out and route home**

Demo mode labels this action `Reset demo` and uses the existing explicit reset path; connected mode labels it `Sign out`. On connected success, replace `/` so protected routes are removed from navigation history.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm test -- --runInBand && git diff --check`

Expected: all suites pass.

```bash
git add app/(tabs)/profile.tsx src/features/profile
git commit -m "feat: complete profile editing and sign out"
```

---

### Task 5: Implement authenticated export and deletion operations

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/export-account/index.ts`
- Create: `supabase/functions/delete-account/index.ts`
- Create: `src/services/account/contracts.ts`
- Create: `src/services/account/supabase.ts`
- Create: `src/services/account/__tests__/supabase.test.ts`
- Modify: `src/bootstrap/createAppRuntime.ts`
- Modify: `src/state/AuthProvider.tsx`
- Modify: `src/features/profile/AccountActions.tsx`
- Modify: `src/features/profile/__tests__/AccountActions.test.tsx`
- Create: `docs/runbooks/account-operations.md`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces: `AccountService.requestFreshOtp(email)`, `verifyFreshOtp(email, token)`, `exportData()`, and `deleteAccount()`.
- `exportData` returns a versioned JSON object containing the user's profile, memberships, preferences, authored messages, reactions, memories, and invite metadata without signed media URLs.
- `deleteAccount` returns `{ deleted: true }` only after database/media cleanup and Auth Admin deletion succeed.

- [ ] **Step 1: Write failing account-service tests**

Use a narrow functions/auth client fake. Prove request uses `shouldCreateUser: false`, verification requires six digits, export rejects a non-2xx function response, deletion signs out locally only after `{ deleted: true }`, and raw function error text never reaches the consumer error.

- [ ] **Step 2: Implement the client account service**

Invoke `export-account` and `delete-account` with the restored session JWT. Return stable `AccountError` codes `reauth_required | export_failed | deletion_failed | unavailable`.

- [ ] **Step 3: Implement Edge Function handlers**

Both handlers accept POST only, validate the bearer user with the public Supabase client, and use a service-role client only after identity is established. Delete additionally rejects JWTs older than ten minutes. Export queries only rows the authenticated user owns or belongs to and serializes durable storage paths.

Deletion removes push tokens, reports authored by the user, private memories, reactions, memberships/preferences/invites, owned media, and the auth user. If the user is a Space creator with another member, transfer creator metadata to the remaining member before profile deletion; delete empty Spaces. Return generic JSON errors and log only operation IDs/user UUIDs.

- [ ] **Step 4: Complete the Profile export/delete UI**

Export requires one tap plus the platform share/download result. Delete requires: explanation → email OTP request → six-digit verification → typing `DELETE` → final call. Disable duplicate actions, preserve entered values on recoverable failure, and return to the welcome screen only after success.

- [ ] **Step 5: Add local operation documentation and verification**

Document deploy commands, required function secrets, fresh-auth rule, cleanup policy, manual reconciliation after partial provider failure, and support response steps. Run service/component tests locally. Run Edge Functions and database cleanup assertions only after the Supabase local stack or hosted development project becomes available; record that external gate explicitly until then.

- [ ] **Step 6: Verify and commit locally complete behavior**

Run: `npm run verify:ci && npm run e2e && git diff --check`

Expected: all credential-free checks pass. Do not claim account deletion production-verified until the functions are deployed and exercised against two test users.

```bash
git add supabase/functions supabase/config.toml src/services/account src/bootstrap/createAppRuntime.ts src/state/AuthProvider.tsx src/features/profile docs/runbooks/account-operations.md
git commit -m "feat: add account export and verified deletion"
```

---

## Completion Gate

This plan is locally complete when anonymous sign-in is absent, connected data cannot load before auth, OTP and route protection are automated, profile edit/sign-out/export/deletion UI is complete, and credential-free verification is green. It is externally complete only after Supabase SMTP/Auth settings and both Edge Functions are deployed and the lifecycle is tested with real email delivery and two isolated accounts; preserve that distinction in the production tracker.
