# Kin Development Runbook

This runbook covers the current local and build foundation. It distinguishes checks that run without accounts from external gates that require Docker, hosted services, store access, or physical devices.

## Supported toolchain

Kin targets Node 22 for local development and CI. Confirm the active version before installing dependencies:

```bash
node --version
npm ci
```

If your machine has nvm, `.nvmrc` lets you select it with `nvm use`. `npm install` is appropriate when intentionally changing dependencies. Use `npm ci` to reproduce the lockfile exactly.

## Choose an environment explicitly

Create the ignored local environment file:

```bash
cp .env.example .env
```

The `EXPO_PUBLIC_KIN_ENVIRONMENT` value is required and accepts exactly:

- `demo` — fictional Maya/Jamie data, local AsyncStorage, and labelled demo Kin+;
- `development` — local or hosted development Supabase;
- `preview` — hosted staging services and internal-distribution builds;
- `production` — hosted production services and real platform billing.

An absent or invalid value renders **Kin needs configuration**. It never opens demo data silently.

### Credential-free demo

Keep this value in `.env`:

```dotenv
EXPO_PUBLIC_KIN_ENVIRONMENT=demo
```

Then run:

```bash
npm start
```

Press `w` for web or open the QR code in a compatible Expo client. For browser-only work:

```bash
npm run web
```

The reproducible story URL is:

```text
http://localhost:8081/?demo=story&demoDate=2026-12-05
```

### Connected development

Use only public client values in `.env`:

```dotenv
EXPO_PUBLIC_KIN_ENVIRONMENT=development
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_WEB_API_KEY=rcb_YOUR_PUBLIC_KEY
```

Loopback HTTP Supabase URLs and legacy local anon JWTs are accepted only in `development`. Preview and production require HTTPS plus an `sb_publishable_` key. Keys beginning `sb_secret_` and service-role values are rejected.

The connected repository is not a production release gate yet: the account-lifecycle plan must replace its temporary anonymous identity with email OTP before consumer deployment.

## Verification

Run the complete credential-free CI equivalent:

```bash
npm run verify:ci
npm run e2e
```

This executes:

- resolved Expo configuration checks for controlled demo and production-shaped inputs;
- TypeScript and Expo ESLint;
- Jest domain, data, component, and acceptance suites;
- a demo-profile production web export;
- production dependency policy, which fails for high or critical advisories and reports moderate findings;
- Playwright phone and wide-browser flows against a fresh demo server.

Focused commands remain available:

```bash
npm run typecheck
npm run lint
npm test
npm run verify:environment
npm run export:web:demo
npm run audit:production
```

Playwright owns port 8081 and deliberately refuses to reuse a running server. Stop another local Expo process on that port before starting E2E.

## Generated files

Expo generates `expo-env.d.ts`; it is intentionally ignored. `.expo/`, `dist/`, Playwright reports, test results, and `output/` are also ignored. Running verification should not leave tracked generated-file changes.

## EAS profiles

`eas.json` defines:

- `development` — development client and internal distribution;
- `preview` — internal staging build;
- `production` — store build with remote app-version management and auto-increment;
- `submit.production` — production store submission profile.

The app uses Expo owner `moondrunk`, slug `kin`, scheme `kin`, and package identifier `com.kaseyho.kin` on iOS and Android. The EAS project ID is added only after the real EAS project is initialized.

Public Supabase and RevenueCat SDK values may be stored in the appropriate EAS environment. SMTP credentials, Supabase service-role keys, RevenueCat webhook secrets, Apple/Google credentials, and monitoring tokens must use provider secret stores and must never be prefixed `EXPO_PUBLIC_`.

## External gates

These commands are intentionally not part of credential-free verification.

### Local Supabase

Requires a running Docker daemon:

```bash
supabase start
supabase db reset
supabase test db
```

### Hosted Supabase

Requires Supabase CLI authentication and the intended project reference:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Do not run `db push` against production until migrations and RLS tests pass locally and a backup exists.

### Native development builds

Requires the real EAS project plus iOS/Android signing and push credentials:

```bash
npx eas-cli@latest build --profile development --platform all
```

### Production builds and submission

Requires live Supabase, RevenueCat products, legal/support URLs, store records, and signing credentials:

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform all
```

A successful EAS build does not prove App Store or Google Play approval. Record store review state and physical-device acceptance separately.

## Production work tracker

The complete product contract is in `docs/superpowers/specs/2026-09-14-kin-production-readiness-design.md`. The current executable phase is `docs/superpowers/plans/2026-09-14-kin-production-foundation.md`; its follow-on plan list covers auth/account lifecycle, backend safety, messaging/notifications, billing, UI completion, and deployment/submission.
