# Kin

Kin is a relationship-first messenger that helps two people keep the parts of a conversation that matter. A message can become a private or shared Moment, important date, or plan, then resurface in the relationship’s timeline. The product stays intentionally small: one person, one private Kin Space, ordinary messaging, and memory without scoring the relationship.

The repository contains a mobile-first Expo app with two runtime modes:

- **Demo mode** is the safe default. It persists a fictional Maya-and-Jamie story in AsyncStorage and requires no account or backend.
- **Connected mode** is selected only when a valid HTTPS Supabase URL and `sb_publishable_…` key are both present. It uses anonymous Supabase Auth, RLS-protected tables, private media storage, and Realtime.

## Run the app

Requirements: a current Node.js/npm installation. A native development build additionally needs the normal Expo iOS or Android toolchain.

```bash
npm install
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

## Verification

```bash
npm run verify
npm run e2e
npm run audit:production
```

`npm run verify` runs the resolved Expo environment check, TypeScript, Expo ESLint, all Jest component/domain/acceptance tests, and a demo-profile production web export. `npm run e2e` starts Expo web in explicit demo mode and runs the browser-driven phone and wide-screen flows. `npm run audit:production` fails for high or critical production dependency advisories while reporting moderate findings for review. Playwright may ask for its browser once:

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

Never place a service-role key in an Expo public variable. In the Supabase project, enable anonymous sign-ins because the MVP creates a private anonymous account before profile setup. Apply the checked-in migration with your normal linked-project workflow:

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

Kin+ uses the RevenueCat entitlement identifier `kin_plus`. Configure a current offering with monthly and/or annual packages in RevenueCat, then place only the platform public SDK keys in the untracked `.env` file:

```dotenv
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_YOUR_PUBLIC_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_YOUR_PUBLIC_KEY
```

Real purchases require a configured native development build; the web adapter deliberately reports billing as unavailable. Build with the native RevenueCat module included, for example through `npx expo run:ios`, `npx expo run:android`, or an EAS development profile. The Kin+ screen keeps **Restore purchases** visible, treats user cancellation quietly, and offers retry after provider failure. Demo-mode activation is labeled and stored separately from real provider state.

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
