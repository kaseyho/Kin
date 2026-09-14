# Kin Production Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Kin explicit, fail-fast runtime environments and reproducible web/iOS/Android build foundations without requiring production credentials yet.

**Architecture:** A pure environment parser owns the demo/development/preview/production contract and is injected into repository and billing factories. Expo configuration and EAS profiles consume the same public environment names, while a boot result renders a recoverable configuration screen instead of crashing or silently opening demo data. Verification scripts exercise behavior and generated configuration rather than inspecting source text.

**Tech Stack:** Expo SDK 57, Expo Router, React Native 0.86, TypeScript 6, Jest, Expo Application Services, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-14-kin-production-readiness-design.md`

## Global Constraints

- Preserve the existing relationship-first P0 and its parchment, plum, rose, editorial typography, botanical paper, and kept-corner visual system.
- Demo, development, preview, and production are explicit profiles; production never falls back to demo services.
- Responsive web, iOS, and Android remain supported consumer surfaces.
- The first production release is intentionally light-only.
- No secret uses an `EXPO_PUBLIC_` name or enters the repository.
- Runtime changes follow strict red-green-refactor and each task ends in a focused commit.
- Continue on `main` because the user explicitly selected it; preserve unrelated worktree changes.

## File Structure

- `src/config/environment.ts` — parses and validates the public runtime contract without reading platform UI state.
- `src/config/__tests__/environment.test.ts` — protects explicit selection, local-development exceptions, and production safety.
- `src/data/createRepository.ts` — selects only the repository named by the parsed environment.
- `src/data/__tests__/createRepository.test.ts` — proves no silent demo fallback.
- `src/bootstrap/createAppRuntime.ts` — assembles repository and billing services into a ready/error boot result.
- `src/bootstrap/__tests__/createAppRuntime.test.ts` — proves configuration faults become renderable boot state.
- `src/components/ConfigurationErrorScreen.tsx` — relationship-aligned fatal configuration UI for developers/operators.
- `app/_layout.tsx` — renders the boot result and mounts providers only when services are ready.
- `app.config.ts` — canonical Expo app metadata, platform identifiers, permissions, linking, and build metadata.
- `app.json` — removed after dynamic config becomes canonical.
- `eas.json` — EAS development, preview, production, and submission profiles.
- `.env.example` — complete public variable contract with safe demo defaults.
- `.gitignore`, `expo-env.d.ts` — adopt Expo's generated-file convention without verification churn.
- `.nvmrc` — supported Node LTS for local and CI use.
- `.github/workflows/quality.yml` — deterministic pull-request and `main` verification.
- `scripts/verify-environment.mjs` — executes Expo config under controlled profiles and validates observable output.
- `package.json` — focused environment and CI verification commands.
- `README.md`, `docs/runbooks/development.md` — accurate setup, environment, and build instructions.

---

### Task 1: Make runtime environment selection explicit

**Files:**
- Modify: `src/config/environment.ts`
- Modify: `src/config/__tests__/environment.test.ts`
- Modify: `src/data/createRepository.ts`
- Modify: `src/data/__tests__/createRepository.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `KinDeployment = 'demo' | 'development' | 'preview' | 'production'`
- Produces: `ConfigurationError extends Error`
- Produces: `readEnvironment(values?: EnvironmentValues): KinEnvironment`
- `KinEnvironment` is `{ deployment: 'demo'; mode: 'demo' }` or `{ deployment: Exclude<KinDeployment, 'demo'>; mode: 'connected'; supabaseUrl: string; supabasePublishableKey: string }`.
- `createRepository(storage, values, factories)` continues to return `KinRepository` but now propagates `ConfigurationError` for absent or unsafe connected configuration.

- [ ] **Step 1: Replace the environment tests with failing production-contract cases**

```ts
import { ConfigurationError, readEnvironment } from '../environment';

describe('readEnvironment', () => {
  it('requires an explicit deployment profile', () => {
    expect(() => readEnvironment({})).toThrow(ConfigurationError);
    expect(() => readEnvironment({})).toThrow('Set EXPO_PUBLIC_KIN_ENVIRONMENT');
  });

  it('selects an isolated demo only when requested', () => {
    expect(readEnvironment({ EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' })).toEqual({
      deployment: 'demo',
      mode: 'demo',
    });
  });

  it.each(['development', 'preview', 'production'] as const)(
    'requires complete Supabase configuration for %s',
    (deployment) => {
      expect(() => readEnvironment({ EXPO_PUBLIC_KIN_ENVIRONMENT: deployment }))
        .toThrow('Supabase URL and publishable key');
    },
  );

  it('accepts HTTPS hosted connected configuration', () => {
    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
    })).toEqual({
      deployment: 'production',
      mode: 'connected',
      supabasePublishableKey: 'sb_publishable_example',
      supabaseUrl: 'https://kin.supabase.co',
    });
  });

  it('allows loopback HTTP and legacy local anon keys only in development', () => {
    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'development',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    }).mode).toBe('connected');
    expect(() => readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    })).toThrow('HTTPS Supabase URL');
  });

  it.each(['service_role_secret', 'sb_secret_example'])(
    'rejects privileged-looking public key %s',
    (key) => {
      expect(() => readEnvironment({
        EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      })).toThrow('publishable key');
    },
  );
});
```

- [ ] **Step 2: Run the focused tests and verify the intended red result**

Run: `npm test -- src/config/__tests__/environment.test.ts --runInBand`

Expected: FAIL because `ConfigurationError` and explicit deployment parsing do not exist and `{}` still selects demo.

- [ ] **Step 3: Implement the environment contract**

```ts
export type KinDeployment = 'demo' | 'development' | 'preview' | 'production';

export type KinEnvironment =
  | { deployment: 'demo'; mode: 'demo' }
  | {
      deployment: Exclude<KinDeployment, 'demo'>;
      mode: 'connected';
      supabaseUrl: string;
      supabasePublishableKey: string;
    };

export type EnvironmentValues = Record<string, string | undefined>;

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function readEnvironment(values: EnvironmentValues = process.env): KinEnvironment {
  const rawDeployment = values.EXPO_PUBLIC_KIN_ENVIRONMENT?.trim();
  if (!isDeployment(rawDeployment)) {
    throw new ConfigurationError(
      'Set EXPO_PUBLIC_KIN_ENVIRONMENT to demo, development, preview, or production.',
    );
  }
  if (rawDeployment === 'demo') return { deployment: 'demo', mode: 'demo' };

  const supabaseUrl = values.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey = values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new ConfigurationError('Connected Kin requires a Supabase URL and publishable key.');
  }
  if (!isAllowedUrl(supabaseUrl, rawDeployment)) {
    throw new ConfigurationError('Connected Kin requires an HTTPS Supabase URL outside local development.');
  }
  if (!isAllowedPublicKey(supabasePublishableKey, rawDeployment)) {
    throw new ConfigurationError('Use a Supabase publishable key; never expose a secret or service-role key.');
  }
  return { deployment: rawDeployment, mode: 'connected', supabasePublishableKey, supabaseUrl };
}
```

Add private `isDeployment`, `isAllowedUrl`, and `isAllowedPublicKey` helpers. The URL helper permits `http://127.0.0.1` and `http://localhost` only for `development`. The key helper accepts `sb_publishable_` everywhere, accepts `eyJ` only in development, and rejects strings containing `service_role` or beginning `sb_secret_`.

- [ ] **Step 4: Update repository selection tests before production code**

Replace implicit-demo expectations with:

```ts
expect(() => createRepository(storage, {}, factories)).toThrow('Set EXPO_PUBLIC_KIN_ENVIRONMENT');

createRepository(storage, { EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' }, factories);
expect(createDemo).toHaveBeenCalledTimes(1);

createRepository(storage, {
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'preview',
  EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
}, factories);
expect(createConnected).toHaveBeenCalledWith({
  publishableKey: 'sb_publishable_example',
  storage,
  url: 'https://kin.supabase.co',
});
```

Run: `npm test -- src/config/__tests__/environment.test.ts src/data/__tests__/createRepository.test.ts --runInBand`

Expected: PASS after `createRepository` consumes the new union without adding fallback logic.

- [ ] **Step 5: Make demo explicit in the public template and run the full unit suite**

Set the first non-comment line of `.env.example` to:

```dotenv
EXPO_PUBLIC_KIN_ENVIRONMENT=demo
```

Keep connected values blank and document that development, preview, and production require both Supabase values.

Run: `npm run typecheck && npm test -- --runInBand`

Expected: 31 suites and 73 or more tests pass.

- [ ] **Step 6: Commit the explicit runtime contract**

```bash
git add .env.example src/config/environment.ts src/config/__tests__/environment.test.ts src/data/createRepository.ts src/data/__tests__/createRepository.test.ts
git commit -m "feat: make Kin runtime environments explicit"
```

---

### Task 2: Render configuration failures as a complete boot state

**Files:**
- Create: `src/bootstrap/createAppRuntime.ts`
- Create: `src/bootstrap/__tests__/createAppRuntime.test.ts`
- Create: `src/components/ConfigurationErrorScreen.tsx`
- Create: `src/components/__tests__/ConfigurationErrorScreen.test.tsx`
- Modify: `app/_layout.tsx`
- Modify: `src/services/billing/index.ts`
- Modify: `src/services/billing/__tests__/demo.test.ts`

**Interfaces:**
- Consumes: `readEnvironment(values): KinEnvironment` from Task 1.
- Produces: `AppRuntime = { status: 'ready'; environment: KinEnvironment; repository: KinRepository; premiumService: PremiumService } | { status: 'configuration-error'; error: ConfigurationError }`.
- Produces: `createAppRuntime(storage, values?, factories?): AppRuntime`.
- Produces: `createPremiumService({ deployment, storage }): PremiumService`; demo entitlement is available only when `deployment === 'demo'`.

- [ ] **Step 1: Write a failing boot-result test**

```ts
it('turns invalid configuration into a renderable result', () => {
  const runtime = createAppRuntime(storage, {});
  expect(runtime.status).toBe('configuration-error');
  if (runtime.status === 'configuration-error') {
    expect(runtime.error.message).toContain('EXPO_PUBLIC_KIN_ENVIRONMENT');
  }
});

it('assembles demo services only for the demo deployment', () => {
  const runtime = createAppRuntime(storage, { EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' }, factories);
  expect(runtime).toMatchObject({ status: 'ready', environment: { deployment: 'demo' } });
  expect(factories.createDemoRepository).toHaveBeenCalledTimes(1);
  expect(factories.createDemoPremium).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the boot test and verify it fails because the module is absent**

Run: `npm test -- src/bootstrap/__tests__/createAppRuntime.test.ts --runInBand`

Expected: FAIL with module-not-found for `createAppRuntime`.

- [ ] **Step 3: Implement service assembly with dependency-injected factories**

`createAppRuntime` catches only `ConfigurationError`; unexpected programming errors still throw. It reads the environment once, passes the same values to the repository factory, and selects demo billing only for demo. Connected billing without a platform public key returns an unavailable service in development/preview and becomes a production configuration error when the production bundle for that platform is validated in Task 3.

- [ ] **Step 4: Write a failing configuration-screen behavior test**

```tsx
render(<ConfigurationErrorScreen message="Set EXPO_PUBLIC_KIN_ENVIRONMENT" />);
expect(screen.getByRole('header', { name: 'Kin needs configuration' })).toBeTruthy();
expect(screen.getByText('Set EXPO_PUBLIC_KIN_ENVIRONMENT')).toBeTruthy();
expect(screen.getByText('Open the developer setup guide, update the environment, then restart Kin.')).toBeTruthy();
```

Run: `npm test -- src/components/__tests__/ConfigurationErrorScreen.test.tsx --runInBand`

Expected: FAIL with module-not-found for `ConfigurationErrorScreen`.

- [ ] **Step 5: Implement the screen and mount the boot result**

Use `SafeAreaView`, `colors.parchment`, `colors.plumInk`, `colors.rose`, and `typography.display/body`. The screen has no fake retry button because embedded Expo environment changes require a restart. In `app/_layout.tsx`, create the runtime once and render this screen when its status is `configuration-error`; mount `PremiumProvider` and `KinProvider` only for `ready`.

- [ ] **Step 6: Verify focused and full behavior**

Run: `npm test -- src/bootstrap/__tests__/createAppRuntime.test.ts src/components/__tests__/ConfigurationErrorScreen.test.tsx --runInBand`

Expected: PASS.

Run: `npm run typecheck && npm test -- --runInBand`

Expected: all suites pass with no warning introduced by the boot path.

- [ ] **Step 7: Commit the complete boot state**

```bash
git add app/_layout.tsx src/bootstrap src/components/ConfigurationErrorScreen.tsx src/components/__tests__/ConfigurationErrorScreen.test.tsx src/services/billing
git commit -m "feat: add production configuration boot state"
```

---

### Task 3: Add canonical Expo and EAS release configuration

**Files:**
- Create: `app.config.ts`
- Create: `eas.json`
- Create: `scripts/verify-environment.mjs`
- Create: `.nvmrc`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `expo-env.d.ts`
- Delete: `app.json`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_KIN_ENVIRONMENT`, Supabase public values, and per-platform RevenueCat public values.
- Produces: Expo slug `kin`, owner `moondrunk`, scheme `kin`, iOS bundle ID `com.kaseyho.kin`, and Android package `com.kaseyho.kin`.
- Produces: `npm run verify:environment` which exits non-zero when an observable Expo profile violates the release contract.

- [ ] **Step 1: Create the behavioral environment verifier before changing configuration**

The script spawns `npx expo config --type public --json` with controlled child environments, parses stdout, and asserts:

```js
assert.equal(config.name, 'Kin');
assert.equal(config.slug, 'kin');
assert.equal(config.scheme, 'kin');
assert.equal(config.userInterfaceStyle, 'light');
assert.equal(config.ios.bundleIdentifier, 'com.kaseyho.kin');
assert.equal(config.android.package, 'com.kaseyho.kin');
assert.equal(config.web.output, 'single');
assert.ok(!config.android.permissions?.includes('android.permission.RECORD_AUDIO'));
```

It evaluates demo configuration without external credentials. It then evaluates production with syntactically safe fixture public values and asserts `extra.kinEnvironment === 'production'`. It never prints environment values.

- [ ] **Step 2: Run the verifier and confirm the intended failure**

Run: `node scripts/verify-environment.mjs`

Expected: FAIL because `app.json` lacks bundle IDs and still advertises automatic appearance.

- [ ] **Step 3: Replace static app JSON with typed dynamic configuration**

`app.config.ts` retains existing plugins and web single output, then adds:

```ts
const app: ExpoConfig = {
  ...config,
  name: 'Kin',
  slug: 'kin',
  owner: 'moondrunk',
  scheme: 'kin',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.kaseyho.kin', supportsTablet: true },
  android: {
    package: 'com.kaseyho.kin',
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    ['expo-image-picker', { photosPermission: 'Choose photos to share privately in Kin.' }],
  ],
  experiments: { typedRoutes: true },
  extra: { ...config.extra, kinEnvironment: process.env.EXPO_PUBLIC_KIN_ENVIRONMENT },
};
```

Do not add associated domains, icons, splash paths, or an EAS project ID until their real files/domain/project exist. Those are added by the brand-assets and deployment plans, preventing config from pointing at fictional external state.

- [ ] **Step 4: Add EAS profiles without secrets**

`eas.json` defines:

```json
{
  "cli": { "version": ">= 24.3.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_KIN_ENVIRONMENT": "development" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_KIN_ENVIRONMENT": "preview" }
    },
    "production": {
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_KIN_ENVIRONMENT": "production" }
    }
  },
  "submit": { "production": {} }
}
```

Add Node `22` to `.nvmrc`. Add `verify:environment` to `package.json` and include it before web export in `verify`.

- [ ] **Step 5: Adopt Expo's generated-file convention**

Run `EXPO_PUBLIC_KIN_ENVIRONMENT=demo npx expo config --type public` once. Inspect the exact `.gitignore` and `expo-env.d.ts` changes. Keep Expo's generated marker block and generated type-reference content so later config/export runs no longer dirty tracked files. Do not stage unrelated output.

- [ ] **Step 6: Verify all build profiles locally**

Run: `npm run verify:environment`

Expected: PASS for controlled demo and production fixture environments.

Run: `EXPO_PUBLIC_KIN_ENVIRONMENT=demo npx expo export --platform web`

Expected: production web export completes and the worktree contains no unexpected generated changes.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 7: Commit canonical release configuration**

```bash
git add .gitignore .nvmrc app.config.ts eas.json expo-env.d.ts package.json package-lock.json scripts/verify-environment.mjs
git rm app.json
git commit -m "build: add explicit Expo release profiles"
```

---

### Task 4: Establish repeatable CI and dependency policy

**Files:**
- Create: `.github/workflows/quality.yml`
- Create: `scripts/check-audit.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run audit:production` which fails on high/critical advisories and prints moderate advisories for tracked remediation.
- Produces: `npm run verify:ci` which runs environment verification, typecheck, lint, Jest, production web export, and the production audit policy.

- [ ] **Step 1: Write and run the audit-policy script against captured npm JSON**

`scripts/check-audit.mjs` accepts JSON from stdin, reads `metadata.vulnerabilities`, prints counts, and exits 1 only when `high + critical > 0`. Malformed input exits 2. Test it through Node's built-in test runner with three literal fixtures: zero severe passes, one high fails, malformed JSON fails distinctly.

Run: `node --test scripts/__tests__/check-audit.test.mjs`

Expected: FAIL because the script does not exist.

- [ ] **Step 2: Implement the minimal audit policy and verify red becomes green**

Run: `node --test scripts/__tests__/check-audit.test.mjs`

Expected: PASS for all three process-level cases.

Add:

```json
"audit:production": "npm audit --omit=dev --json | node scripts/check-audit.mjs",
"verify:ci": "npm run verify:environment && npm run typecheck && npm run lint && npm test -- --runInBand && npm run export:web && npm run audit:production"
```

The pipe script must preserve npm audit JSON even when npm itself exits non-zero; the policy script becomes the authoritative CI status.

- [ ] **Step 3: Add the GitHub Actions workflow**

On pull requests and pushes to `main`, use Ubuntu, Node 22, `npm ci`, Playwright Chromium installation with dependencies, `npm run verify:ci`, and `npm run e2e`. Upload `output/playwright/` only on failure. Use concurrency cancellation per branch. Do not add repository secrets because demo CI is credential-free.

- [ ] **Step 4: Run the exact CI commands locally**

Run: `npm run verify:ci`

Expected: all commands pass; the audit stage reports the current moderate count and zero high/critical.

Run: `npm run e2e`

Expected: all existing Playwright tests pass.

- [ ] **Step 5: Commit CI and policy**

```bash
git add .github/workflows/quality.yml README.md package.json package-lock.json scripts/check-audit.mjs scripts/__tests__/check-audit.test.mjs
git commit -m "ci: verify Kin production foundations"
```

---

### Task 5: Give developers an accurate environment and release runbook

**Files:**
- Create: `docs/runbooks/development.md`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: commands and environment profiles proven by Tasks 1–4.
- Produces: a copyable clean-install path for demo and connected development, without claiming hosted/device proof.

- [ ] **Step 1: Write the runbook from verified commands**

Document:

- Node 22 selection with `nvm use`;
- `npm ci` for a clean install;
- copying `.env.example` and deliberately choosing `demo` or `development`;
- starting demo web and native development builds;
- local Supabase requirements and the existing Docker dependency;
- `npm run verify:ci` and `npm run e2e`;
- EAS profile purposes and where public values versus secrets belong;
- generated-file expectations;
- the current external proof boundary.

Every command included in the primary setup path must have been executed in this repository during Tasks 1–4. Commands requiring absent Docker, Supabase, store, or device credentials belong under a clearly marked external-gate section.

- [ ] **Step 2: Rewrite stale README mode and billing claims**

Remove statements that demo is an implicit fallback, connected mode is anonymous, and web billing is deliberately unavailable. Link the production design and this runbook. Preserve the current product explanation and demo walkthrough.

- [ ] **Step 3: Verify documentation commands and repository cleanliness**

Run: `npm run verify:ci && npm run e2e && git diff --check`

Expected: PASS with no unexpected tracked changes.

- [ ] **Step 4: Commit developer documentation**

```bash
git add .env.example README.md docs/runbooks/development.md
git commit -m "docs: add Kin development runbook"
```

---

## Follow-on Plans

After this foundation plan is green, implement the production spec through separate reviewable plans in this dependency order:

1. `2026-09-14-kin-auth-and-account-lifecycle.md` — email OTP, auth routing, profile editing, export/sign-out/deletion.
2. `2026-09-14-kin-space-safety-and-data.md` — atomic Space lifecycle, two-person enforcement, invites, leave/block/report, RLS and storage cleanup tests.
3. `2026-09-14-kin-messaging-and-notifications.md` — pagination, idempotency, connectivity, unread state, push tokens/functions, device routing.
4. `2026-09-14-kin-billing.md` — RevenueCat identity, web/native offerings, webhook projection, server premium enforcement.
5. `2026-09-14-kin-ui-completion.md` — complete screen-state matrix, settings/legal/support, responsive/accessibility/device QA, brand assets.
6. `2026-09-14-kin-deployment-and-submission.md` — Supabase staging/production, EAS project, web deploy, native builds, stores, Devpost package, rollback and final acceptance.

Each follow-on plan must be written immediately before its implementation, after inspecting the state produced by the preceding plan. This avoids prescribing stale line numbers or interfaces while preserving the full production objective.
