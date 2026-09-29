# Title

Kin — A Messenger That Remembers What Matters

## One-line Summary

A private relationship-first messenger that turns meaningful messages into Moments, shared timelines, and memories worth rediscovering.

## Problem

Messaging apps are excellent at helping us talk, but poor at helping us remember. The conversations that matter most — with a partner, best friend, parent, or sibling — eventually disappear inside thousands of chronologically ordered messages. Photos, plans, first dates, favourite places, and small promises are technically still there, but retrieving and reliving them is work.

Every relationship also receives almost the same generic chat interface. The history shared with a partner feels no more personal than a project group, even though those relationships carry very different meaning.

## Solution

Kin is a private messenger built around the relationship rather than the inbox. Each one-to-one Kin Space combines a familiar conversation with a second layer for the relationship itself.

A person can long-press any meaningful message and choose **Remember this**, then preserve it as a Moment, important date, or plan. Saved items appear in the relationship view and chronological timeline, retain a link to the source conversation, and can resurface through **On This Day**. Each Space can also have its own nickname, accent, wallpaper, shared media, and relationship sticker.

The result is still simple messaging, but with somewhere for the meaning inside those messages to live.

## Why This Matters

The people closest to us generate years of digital history, yet the software holding that history treats it as disposable scrollback. Kin helps people preserve memories deliberately, rediscover them at meaningful times, and make a private digital space feel like it belongs to that relationship.

Kin is intentionally not a public social network, relationship score, surveillance tool, or automated relationship coach. It is designed to strengthen communication between people who already know one another. Ordinary messaging remains free, existing saved history remains available after a subscription ends, private conversations contain no ads, and relationship data is not sold.

## How We Used AI

Kin does not send private relationship content to a generative model and does not place an AI participant inside a relationship. The core memory flow is explicit: a person chooses what to save, and deterministic date logic powers timeline ordering and On This Day resurfacing. This is a deliberate privacy and product decision, not a missing feature.

AI was used during development as a collaborator for turning the original product thesis into an implementation plan, evaluating edge cases, generating test scenarios, reviewing interaction copy, and checking whether monetization and recovery states stayed aligned with the product's emotional and privacy goals. The fictional Maya-and-Jamie demo story and original demo assets were also developed as a safe, non-personal narrative for repeatable testing and presentation.

## How We Used Codex

Codex was used throughout the build rather than only for a final code pass. It helped:

- translate the product requirements into a focused Expo, Supabase, and RevenueCat architecture;
- implement the app in test-driven slices covering authentication, account lifecycle, invitations, messaging, Moments, personalization, safety, notifications, billing, and deployment;
- design server-authoritative Supabase functions, RLS policies, private Storage, Realtime subscriptions, scheduled cleanup, and notification workers;
- build the RevenueCat client adapters and a signed, idempotent webhook that refreshes current subscriber state instead of trusting individual lifecycle events;
- create and inspect the original brand mark, store icon, adaptive Android layers, splash screen, favicon, and Devpost screenshots;
- run CI-equivalent tests, browser journeys, production bundle scans, dependency checks, live deployment checks, and provider-boundary audits;
- deploy the public demo to Vercel and the production backend, migrations, Edge Functions, secrets, and scheduled workers to Supabase.

Codex was also used to challenge over-broad ideas. Features such as relationship scoring, silent AI inference, public feeds, ads inside conversations, and locking old memories behind a subscription were deliberately excluded because they weakened the product thesis.

## Key Features

- **Private one-to-one Kin Spaces:** create a Space or join through a private, expiring, single-use invitation.
- **Familiar messaging:** text and image messages, reactions, timestamps, relationship stickers, realtime updates, retry and offline states.
- **Remember this:** turn a source message into a Moment, important date, or plan without losing its conversational context.
- **Relationship view and timeline:** browse recent Moments, future plans, shared media, and a chronological history.
- **On This Day:** resurface saved memories on their calendar anniversary.
- **Personalization:** per-relationship nickname, accent, theme, and wallpaper.
- **Kin+:** RevenueCat-backed relationship themes and unlimited new Moments; messaging and previously saved history remain available without Kin+.
- **Safety and privacy:** archive, leave, block, report, private media, membership-scoped RLS, account export, and account deletion.
- **Notifications:** private-by-default message notifications with token lifecycle, retry, receipt reconciliation, and scheduled delivery workers.
- **Explicit demo mode:** a deterministic Maya-and-Jamie story that never silently substitutes for production services.

## Architecture

Kin is a TypeScript application built with Expo SDK 57, React Native, and Expo Router for iOS, Android, and a browser-compatible demo.

- **Client:** Expo/React Native screens depend on a `KinRepository` interface, keeping UI behavior independent of the data provider.
- **Demo adapter:** AsyncStorage-backed fictional data provides a deterministic, credential-free product walkthrough.
- **Connected backend:** Supabase Auth, Postgres, Row Level Security, Realtime, private Storage, RPCs, Edge Functions, Cron, and Vault.
- **Billing:** RevenueCat native and web SDK adapters identify customers with the signed-in Supabase UUID. A signed Supabase webhook refreshes subscriber state and writes a private entitlement projection used for server-authoritative limits.
- **Delivery:** EAS owns native build profiles, isolated Supabase production and staging projects run in Singapore, and Vercel hosts the public demo.

The production bundle validator rejects missing or wrong-platform public keys and checks that server secrets never enter client bundles.

## Testing Instructions

### Fast public walkthrough

1. Open <https://kin-demo-five.vercel.app/?demo=story&demoDate=2026-12-05>.
2. Open Jamie's Kin Space.
3. Select the message **“December 5 was honestly the best first date.”**
4. Choose **Remember this**, select **Moment**, give it a title, and keep it.
5. Open **Relationship with Jamie** and then **Our timeline** to find the preserved source and relationship history.
6. Open **Kin+** to see the premium themes and unlimited-Moments value proposition. The public web build clearly labels its checkout as a simulation.

### Run from source

Requirements: Node 22 and npm.

```bash
npm ci
cp .env.example .env
npm start
```

Keep `EXPO_PUBLIC_KIN_ENVIRONMENT=demo` for the credential-free story. Then run:

```bash
npm run verify:ci
npm run e2e
```

The current release gate passes 67 Jest suites / 340 app tests, 36 Edge Function and operator-tool tests, 14 Playwright journeys across demo and signed-out connected builds, TypeScript, lint, web export, production bundle isolation, and a production dependency policy with 0 high and 0 critical advisories. Expo Doctor passes all 21 checks. EAS also completed an internal Android demo APK from commit `0360804`; the build record is [`15c01a0b-e419-4023-ab16-9dab5e5c8864`](https://expo.dev/accounts/moondrunk/projects/kin/builds/15c01a0b-e419-4023-ab16-9dab5e5c8864).

EAS also completed the connected Android staging APK from commit `a946b3b`; the build record is
[`5566bd53-578b-4198-b069-d3d4f3fc9f60`](https://expo.dev/accounts/moondrunk/projects/kin/builds/5566bd53-578b-4198-b069-d3d4f3fc9f60).
It uses isolated staging Supabase and proves the connected release bundle builds successfully. It
must not be used for Test Store checkout because RevenueCat intentionally restricts Test Store keys
to debuggable apps. The separate judge APK described below is the correct Test Store build.

## Public Demo Link

<https://kin-demo-five.vercel.app/?demo=story&demoDate=2026-12-05>

This is a visibly labelled, credential-free demo. Purchases are simulated and it does not contain private consumer data.

## Public Repository Link

<https://github.com/kaseyho/Kin>

The repository is public on the `main` branch. Local environment files and credentials are ignored; production secrets live in provider secret stores rather than the repository.

## Demo Video

**Public YouTube URL:** <https://youtu.be/HWi-CvJgEjA>

The final local master is `output/video/kin-shipaton-final.mp4`: 1:46.2, 1920×1080, 30 fps, H.264
video with 48 kHz AAC voice audio. It combines the talking-head recording, deterministic walkthrough,
and a real RevenueCat Test Store purchase/restore captured in an Android 15 emulator. It passed a
full decode check and visual review at the key transitions.

### 1:46 outline

- **0:00–0:08 — Hook:** introduce Kin as a messenger designed to remember relationships.
- **0:08–0:22 — Conversation:** open Jamie's private Kin Space.
- **0:22–0:43 — Defining action:** choose **Remember this** and save **Our first date** as a Moment.
- **0:43–0:59 — Payoff:** show the relationship view, **On This Day**, and timeline.
- **0:59–1:12 — Expression:** preview the Moonlit relationship theme.
- **1:12–1:31 — RevenueCat:** explain Kin+, then show the Android Test Store purchase, active, and restore states.
- **1:31–1:44 — Build proof:** name Expo, Supabase, RevenueCat, Codex, and the verified test totals.
- **1:44–1:46 — Close:** “Most messengers store messages. Kin remembers relationships.”

The edit uses only original visuals and voice, with no copyrighted music. It stays 13.8 seconds
under the two-minute maximum.

## Screenshot Shot List

All current candidates are frameless PNGs at exactly 1179×2556:

1. `output/playwright/screenshots/kin-devpost-conversation-1179x2556.png` — the relationship-first conversation.
2. `output/playwright/screenshots/kin-devpost-remember-1179x2556.png` — the defining **Remember this** action.
3. `output/playwright/screenshots/kin-devpost-relationship-1179x2556.png` — Jamie's relationship home and recent Moment.
4. `output/playwright/screenshots/kin-devpost-timeline-1179x2556.png` — the chronological relationship timeline.
5. `output/playwright/screenshots/kin-devpost-kin-plus-1179x2556.png` — the aligned Kin+ value proposition.

The required 1024×1024 uncropped icon is `assets/brand/app-icon.png`. The screenshots were captured from the live Expo web demo at an iPhone-sized viewport; the final video supplements them with native Android emulator footage.

## Submission Readiness Notes

### Ready now

- Public GitHub repository and stable public demo URL.
- Original 1024×1024 store icon plus iOS/Android/web splash and icon variants.
- Five visually reviewed, frameless 1179×2556 screenshot candidates.
- Production Supabase project with eight migrations, 17 RLS-enabled public tables, private Storage, five active Edge Functions, and two autonomously verified scheduled workers.
- EAS project, native build profiles, and a completed internal Android demo APK tied to commit `0360804`.
- Green CI-equivalent and browser verification on the branded release.
- Public Privacy Policy, Terms of Use, Community Standards, Support, and account-deletion routes, including a verified external deletion-request operations path.
- Public support now resolves to `kaseyho.work@gmail.com` on the stable demo deployment; production deployment `dpl_8fNrPmSEH95gDQQt11fhP8Nc893u` is `READY` and the root, support, and nested Space routes return HTTP 200.
- RevenueCat now has one required `kin_plus` entitlement, a production-only HMAC-signed webhook, a dedicated v1 server key, and preview/production Android public keys in EAS. The hosted signed-request smoke reached the deployed webhook's expected schema-validation boundary.
- Isolated Supabase staging now has all eight migrations, 17 RLS-enabled public tables, five active functions, two autonomously verified workers, and a sandbox-only HMAC-signed RevenueCat webhook. EAS preview points only to staging and uses the Test Store key.
- Connected Android staging build `5566bd53-578b-4198-b069-d3d4f3fc9f60` finished successfully and its downloaded APK passed archive-integrity verification.
- RevenueCat account email confirmation is complete.
- RevenueCat Test Store purchase and restore were verified on an Android 15 arm64 emulator. The native UI showed **Kin+ is active** and **Kin+ restored**, and staging Supabase stored an active `kin_plus` entitlement from `test_store` for product `monthly`.
- A standalone debuggable judge APK with an embedded JavaScript bundle is ready at `output/android/kin-judge-staging-debuggable.apk`. It cold-started with Metro stopped, reopened the active Kin+ state, and restored purchases without a fatal or provider-key error. This build is intentionally debuggable because RevenueCat Test Store rejects non-debuggable apps; it is not a production-store binary.
- The final 1:46.2 demo master is ready at `output/video/kin-shipaton-final.mp4` and has passed codec, full-decode, loudness, and visual keyframe checks.
- The participant confirmed on September 29 that the entry has no minor participant.
- The participant confirmed on September 30 that they are not RevenueCat staff and not a hackathon sponsor.
- The standalone judge APK is published at <https://github.com/kaseyho/Kin/releases/download/shipaton-2026-judge/kin-judge-staging-debuggable.apk>. The public release notes disclose the isolated staging backend, simulated no-charge Test Store purchases, intentional debuggability, minimum Android version, and SHA-256 digest.
- The approved public demo video is published at <https://youtu.be/HWi-CvJgEjA>. YouTube confirmed the title, description, not-made-for-kids audience setting, and public publication.
- Devpost account authenticated, event registration present, rules acknowledged, and an existing untitled pre-draft found for RevenueCat Shipaton 2026.
- Live Devpost requirements were refreshed on September 29. The deadline is September 30, 2026 at 11:45 PM Pacific Time (`2026-10-01T06:45:00Z`).

### Reserved for the final Devpost entry

- Transfer this reviewed packet into the Devpost draft, including the required icon, at least one frameless screenshot, the public video URL, Android app type, RevenueCat project ID, Next Gen repository and academic email, award answers, and judge-access note.
- Review the resulting Devpost preview, then submit only after a separate explicit confirmation.

### Required only for a store-published entry

- Add the Google Play service-account JSON and create real Play subscription/base-plan products.
- Add Apple and Web Billing credentials only if those platforms will be claimed in the final submission.
- Supply the published store URL. These provider gates are not required for the student Next Gen path, which accepts the public repository and device demo instead.

## Known Limitations

- The public demo intentionally simulates billing. RevenueCat's isolated production and sandbox webhooks, server key, public Android keys, entitlement, offering, and Test Store products are configured, but Google Play credentials and real store-receipt proof remain incomplete.
- Native purchase and restore were verified in an Android 15 emulator, not on a physical Android device. Push delivery still requires physical-device verification.
- The EAS preview APK is a non-debuggable release-style build and therefore cannot use RevenueCat Test Store. Judges must use the standalone debuggable judge APK for no-charge Kin+ testing.
- Hosted Auth still needs a custom SMTP sender and final redirect configuration before consumer signup should be opened broadly.
- Group Kin Spaces, voice/video calls, message import, and automatic AI memory suggestions are explicitly out of scope for this focused first release.

## Official Form Field Map

Official requirements refreshed live from Devpost on 2026-09-29.

| Field | Draft answer / action |
| --- | --- |
| Includes App Icon (required) | **Yes** after attaching `assets/brand/app-icon.png` (1024×1024). |
| Includes screenshot (required) | **Yes** after attaching at least one listed 1179×2556 frameless screenshot. |
| App type (required) | Android. |
| First Version Date Confirmation | Leave unchecked for the Next Gen path unless a store release lands by September 30, 2026. |
| Is Staff or Sponsor | **No.** Confirmed by the participant on September 30, 2026. |
| App Store / Google Play / Galaxy URL | Not required for the student Next Gen path; otherwise a published store URL is mandatory. |
| Next Gen code repository | <https://github.com/kaseyho/Kin> |
| Next Gen student/academic email | `e1511554@u.nus.edu` |
| Minor entrant consent | **No minor participant.** Confirmed by the participant on September 29, 2026; no guardian form is required. |
| RevenueCat project ID (required) | `projc87474b5` |
| Premium judge access | No code or charge is required in the standalone debuggable judge APK. RevenueCat Test Store unlocks Kin+ for that build. Download: <https://github.com/kaseyho/Kin/releases/download/shipaton-2026-judge/kin-judge-staging-debuggable.apk>. |
| RevenueCat Design Award | Kin combines warm editorial typography, parchment-like relationship surfaces, relationship-specific themes, and a layered conversation-to-memory interaction. The design makes the emotional hierarchy visible: messages feel familiar, while Moments and timelines feel archival and intentionally kept. Interaction states remain explicit and accessible across phone and wide layouts. |
| RevenueCat Peace Prize | Kin is designed to help people preserve and revisit meaningful history with partners, close friends, and family without ads, public performance, relationship scoring, or selling intimate data. It gives distant families and busy relationships a private place to remember what was said, planned, and celebrated. |
| HAMM Award | Leave blank. Kin has a coherent monetization model, but this entry makes no real-revenue or growth claim. |
| Target categories | Next Gen Award, RevenueCat Design Award, and RevenueCat Peace Prize. |
| Additional notes for judges | The public demo is deterministic and uses fictional data. The standalone Android judge build uses isolated Supabase staging and RevenueCat Test Store, so judges can exercise Kin+ without a real charge. It is intentionally debuggable for Test Store compatibility and is not a production-store binary. |
| Demo video URL (required) | <https://youtu.be/HWi-CvJgEjA> — public, 1:46.2. |

The live Devpost form does not ask for a Codex session ID, so none is included.
