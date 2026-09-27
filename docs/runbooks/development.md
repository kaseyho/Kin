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
EXPO_PUBLIC_KIN_PUBLIC_URL=http://localhost:8081
EXPO_PUBLIC_KIN_SUPPORT_EMAIL=support@YOUR_REAL_DOMAIN.com
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_WEB_API_KEY=rcb_YOUR_PUBLIC_KEY
```

Loopback HTTP Supabase URLs and legacy local anon JWTs are accepted only in `development`. Preview and production require HTTPS plus an `sb_publishable_` key. Keys beginning `sb_secret_` and service-role values are rejected.

Connected Kin uses email OTP and never falls back to anonymous auth. Use a real routable support
address for hosted development; the `.example` value above is a placeholder and is rejected by
preview/production validation. Use the public web origin that serves `/invite/<code>` for
`EXPO_PUBLIC_KIN_PUBLIC_URL`.

## Verification

Run the complete credential-free CI equivalent:

```bash
npm run verify:ci
npm run e2e
npm run test:database
```

This executes:

- resolved Expo configuration checks for controlled demo and production-shaped inputs;
- TypeScript and Expo ESLint;
- Jest domain, data, component, and acceptance suites;
- a demo-profile production web export;
- production dependency policy, which fails for high or critical advisories and reports moderate findings;
- Playwright phone and wide-browser flows against a fresh demo server.
- local migration, pgTAP, RLS, concurrency, retention, and account-cleanup proof through Docker.

Focused commands remain available:

```bash
npm run typecheck
npm run lint
npm test
npm run verify:environment
npm run export:web:demo
npm run audit:production
npm run test:database
```

Playwright owns port 8081 and deliberately refuses to reuse a running server. Stop another local Expo process on that port before starting E2E.

## Public hackathon demo deployment

The public Vercel project `kin-demo` intentionally builds the credential-free demo profile. It is
separate from the future connected production web deployment. The checked-in configuration builds
on Vercel so Expo's generated font assets are retained and rewrites client-side routes to the SPA
entry point:

```bash
vercel deploy . --prod --yes --project kin-demo -A vercel.demo.json
```

After deployment, verify the stable alias and a direct nested route in a clean browser:

```text
https://kin-demo-five.vercel.app/?demo=story&demoDate=2026-12-05
https://kin-demo-five.vercel.app/space/space-maya-jamie?demoDate=2026-12-05
```

The demo Vercel configuration must not be reused for the connected production site because its
build command deliberately forces `EXPO_PUBLIC_KIN_ENVIRONMENT=demo`.

## Generated files

Expo generates `expo-env.d.ts`; it is intentionally ignored. `.expo/`, `dist/`, Playwright reports, test results, and `output/` are also ignored. Running verification should not leave tracked generated-file changes.

## EAS profiles

`eas.json` defines:

- `demo` — credential-free internal distribution for physical-device demos and hackathon recording;
- `development` — development client and internal distribution;
- `preview` — internal staging build;
- `production` — store build with remote app-version management and auto-increment;
- `submit.production` — production store submission profile.

The app uses Expo owner `moondrunk`, slug `kin`, scheme `kin`, and package identifier `com.kaseyho.kin` on iOS and Android. The EAS project ID is added only after the real EAS project is initialized.

Public Supabase and RevenueCat SDK values may be stored in the appropriate EAS environment. SMTP credentials, Supabase service-role keys, RevenueCat webhook secrets, Apple/Google credentials, and monitoring tokens must use provider secret stores and must never be prefixed `EXPO_PUBLIC_`.

## External gates

These commands are intentionally not part of credential-free verification.

### Local Supabase

Requires a running Docker daemon. The checked-in command starts, resets, tests, and stops the local
stack when it was not already running:

```bash
npm run test:database
```

See `docs/runbooks/space-safety.md` for the covered invariants, report moderation, hosted three-account
smoke, and durable Storage cleanup retry.

### Hosted Supabase

The production project is `Kin Production` (`pmbygfrnervzgprympeq`, Singapore). Authenticate and
link only that explicit target:

```bash
supabase login
supabase link --project-ref pmbygfrnervzgprympeq
supabase db push
```

Do not run `db push` against production until migrations and RLS tests pass locally and a backup exists.
The initial 2026-09-27 deployment used Supabase's authenticated transactional Management API because
CLI 2.117.0 and 2.118.0 both stalled while creating a temporary passwordless login role on this
machine. The remote ledger was aligned to the checked-in migration versions afterward. See
`docs/verification/2026-09-27-hosted-backend.md`; do not manually reapply those migrations.

### Native development builds

Requires the real EAS project plus iOS/Android signing and push credentials:

```bash
npx eas-cli@latest build --profile development --platform all
```

### Credential-free Android demo build

The `demo` profile produces an internally distributed Android artifact with the labelled Maya and
Jamie story and simulated Kin+ checkout. It is suitable for physical-device UI validation and the
hackathon demo video, but it is not consumer production evidence and never connects to Supabase or
RevenueCat:

```bash
EXPO_PUBLIC_KIN_ENVIRONMENT=demo npx eas-cli@latest build \
  --profile demo \
  --platform android \
  --non-interactive
```

### Production builds and submission

Requires live Supabase, RevenueCat products, legal/support URLs, store records, and signing credentials:

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform all
```

A successful EAS build does not prove App Store or Google Play approval. Record store review state and physical-device acceptance separately.

## Production work tracker

The product contract is in `docs/superpowers/specs/2026-09-14-kin-production-readiness-design.md`.
Completed implementation plans live under `docs/superpowers/plans/`; remaining production gates are
tracked by the messaging/notifications, billing, UI-completion, and deployment/submission phases.
