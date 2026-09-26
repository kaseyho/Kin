# Kin

Kin is a relationship-first messenger that helps two people keep the parts of a conversation that matter. A message can become a private or shared Moment, important date, or plan, then resurface in the relationship’s timeline. The product stays intentionally small: one person, one private Kin Space, ordinary messaging, and memory without scoring the relationship.

The repository contains a mobile-first Expo app with four explicit deployment profiles:

- **Demo** persists a fictional Maya-and-Jamie story in AsyncStorage and requires no account or backend.
- **Development** uses local or hosted development services.
- **Preview** uses hosted staging services and internal-distribution builds.
- **Production** requires hosted services and real platform billing.

`EXPO_PUBLIC_KIN_ENVIRONMENT` must select one profile. Missing or unsafe connected configuration renders a dedicated setup screen; Kin never substitutes demo data silently. Connected Kin uses email OTP and identifies RevenueCat customers with the signed-in Supabase UUID.

## Run the app

Requirements: Node 22 (recorded in `.nvmrc`) and npm. A native development build additionally needs the normal Expo iOS or Android toolchain.

```bash
node --version
npm ci
cp .env.example .env
npm start
```

Then open the web target, an emulator, a simulator, or a development build from Expo’s terminal UI.

To exercise the defining demo loop:

1. Choose **Try Maya and Jamie’s demo** on onboarding, or open `/?demo=story&demoDate=2026-12-05` on web.
2. Open Jamie’s Kin Space.
3. Long-press a message (right-click on web), choose **Remember this**, then choose **Moment**.
4. Name and keep it, return to the conversation, and open **Relationship with Jamie**.
5. Find the saved Moment in the relationship view or full timeline.

The optional `demoDate=YYYY-MM-DD` parameter pins date-sensitive resurfacing for reproducible demos. Invalid or impossible calendar dates are ignored. Demo data is reset only through an explicit demo action; unreadable local data is never silently overwritten.

The credential-free public demo is deployed at
[kin-demo-five.vercel.app](https://kin-demo-five.vercel.app/?demo=story&demoDate=2026-12-05).
It is visibly demo-only: purchases are simulated and no private consumer account or production
provider data is used.

## Verification

```bash
npm run verify:ci
npm run e2e
npm run test:database
```

`npm run verify:ci` validates demo and platform-specific production configuration, runs TypeScript, Expo ESLint, all Jest component/domain/acceptance tests, exports demo web, scans a production web bundle for secrets/native keys, checks and tests Edge Functions, and enforces the production dependency policy. `npm run e2e` runs the browser-driven phone and wide-screen flows. `npm run test:database` resets/upgrades local Supabase and runs pgTAP/RLS/concurrency checks. Playwright may ask for its browser once:

```bash
npx playwright install chromium
```

Playwright traces, screenshots, and videos are written below `output/playwright/` and are intentionally untracked.

## Supabase connected mode

Copy the public environment template and fill only public client values:

```bash
cp .env.example .env
```

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Never place a service-role key in an Expo public variable. Connected mode uses email OTP and never silently creates an anonymous production identity. Apply the checked-in migration only after selecting and authenticating the intended project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For an isolated local database with Docker running:

```bash
supabase start
supabase db reset
supabase test db
```

The migration creates profiles, Kin Spaces, membership, themes, messages, reactions, Memories, source-message links, expiring invites, private storage buckets, Realtime publication entries, and RLS on every app table. Shared rows require Space membership; private Memories additionally require creator ownership. Invite redemption runs through a fixed-search-path security-definer function.

## Kin+ and RevenueCat

Kin+ uses the RevenueCat entitlement identifier `kin_plus`, current offering `default`, and standard `$rc_monthly` / `$rc_annual` packages. Prices, periods, trials, and titles come from provider dashboards. Place only platform public SDK keys in the untracked `.env` file:

```dotenv
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_WEB_API_KEY=rcb_YOUR_PUBLIC_KEY
```

Production accepts `appl_` for iOS, `goog_` for Android, and `rcb_` for web; `test_` keys are development/preview only. The web bundle reads only the web key, and native builds select their own platform key. Server API keys, webhook authorization, and HMAC secrets belong only in Supabase Edge Function secrets. Missing development/preview keys expose a truthful unavailable state; missing or wrong production keys fail configuration. Demo activation remains visibly labelled and isolated from provider state.

Follow [`docs/runbooks/billing.md`](docs/runbooks/billing.md) for exact product mappings, restore behavior, webhook filters/secrets, sandbox acceptance, deployment, reconciliation, rollback, and account-deletion support caveats.

## Architecture

Feature screens depend on the `KinRepository` contract rather than Supabase. The root selects either the persistent demo repository or the connected adapter from validated environment values. Domain commands and selectors own memory creation, visibility, limits, timeline ordering, upcoming dates, and On This Day logic. Platform-specific billing files keep native RevenueCat code out of the web bundle.

The bundled Maya and Jamie portraits, first-date photograph, letterpress wallpaper, and Jamie cooking sticker are original fictional demo assets generated for Kin; they do not depict public figures.

## Proof boundaries

The local suite proves the domain rules, repository selection, persistence behavior, UI flows, recovery states, responsive web layout, web-safe native-module boundaries, and production web bundling. The SQL file includes executable RLS assertions, but those assertions require a running local Supabase stack or a configured project.

The following are **not externally verified by the repository alone**:

- a real hosted Supabase project’s Realtime delivery and private storage behavior;
- execution of the RLS test against that project or a running local Docker stack;
- configured App Store / Play products and RevenueCat offering metadata;
- real purchase, cancellation, renewal, and restore receipts;
- native iOS/Android builds, permissions, notifications, and physical-device behavior.

Those checks must be repeated with the intended external projects, store accounts, signed development builds, and devices before release.

The latest billing evidence and the still-open hosted staging gate are recorded in
[`docs/verification/2026-09-27-billing-entitlements.md`](docs/verification/2026-09-27-billing-entitlements.md).

See [`docs/runbooks/development.md`](docs/runbooks/development.md) for the verified setup, CI-equivalent commands, EAS profiles, generated-file rules, and external gates. The full consumer-release contract is [`docs/superpowers/specs/2026-09-14-kin-production-readiness-design.md`](docs/superpowers/specs/2026-09-14-kin-production-readiness-design.md).
