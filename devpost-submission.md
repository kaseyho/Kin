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
- **Delivery:** EAS owns native build profiles, Supabase hosts the production backend in Singapore, and Vercel hosts the public demo.

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

## Public Demo Link

<https://kin-demo-five.vercel.app/?demo=story&demoDate=2026-12-05>

This is a visibly labelled, credential-free demo. Purchases are simulated and it does not contain private consumer data.

## Public Repository Link

<https://github.com/kaseyho/Kin>

The repository is public on the `main` branch. Local environment files and credentials are ignored; production secrets live in provider secret stores rather than the repository.

## Demo Video

**Public YouTube or Vimeo URL:** TODO — record and upload a final device demo, no longer than 2 minutes.

### Two-minute outline

- **0:00–0:10 — Hook:** “Messaging apps help us talk, but the messages that matter disappear. Kin gives each close relationship a space of its own.”
- **0:10–0:30 — Conversation:** open Jamie's Kin Space and show the personalized, familiar message flow.
- **0:30–0:55 — Defining action:** open a meaningful message, choose **Remember this**, and save it as a Moment.
- **0:55–1:20 — Payoff:** open the relationship view and timeline; show the source message, shared photo, important date, and On This Day behavior.
- **1:20–1:38 — Expression:** show relationship-specific personalization and explain that every Space can feel different.
- **1:38–1:55 — RevenueCat:** open Kin+, show monthly/annual terms and the free trial, complete or restore a sandbox purchase, and show premium themes/unlimited Moments becoming active.
- **1:55–2:00 — Close:** “WhatsApp stores messages. Kin remembers relationships.”

Record on the target iOS or Android device. Use only original visuals and voice; do not add copyrighted music. Keep every essential premium action inside the two-minute window.

## Screenshot Shot List

All current candidates are frameless PNGs at exactly 1179×2556:

1. `output/playwright/screenshots/kin-devpost-conversation-1179x2556.png` — the relationship-first conversation.
2. `output/playwright/screenshots/kin-devpost-remember-1179x2556.png` — the defining **Remember this** action.
3. `output/playwright/screenshots/kin-devpost-relationship-1179x2556.png` — Jamie's relationship home and recent Moment.
4. `output/playwright/screenshots/kin-devpost-timeline-1179x2556.png` — the chronological relationship timeline.
5. `output/playwright/screenshots/kin-devpost-kin-plus-1179x2556.png` — the aligned Kin+ value proposition.

The required 1024×1024 uncropped icon is `assets/brand/app-icon.png`. The screenshots were captured from the live Expo web demo at an iPhone-sized viewport; replace or supplement them with equivalent physical-device captures if the final native build renders differently.

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
- Devpost account authenticated, event registration present, rules acknowledged, and an existing untitled pre-draft found for RevenueCat Shipaton 2026.

### Required before final entry

- Confirm the RevenueCat account email from the inbox.
- Add the Google Play service-account JSON and create the real Play subscription/base-plan products. Add Apple and Web Billing credentials only if those platforms will be claimed in the final submission.
- Create an isolated staging Supabase project and sandbox-only RevenueCat webhook before recording the real Test Store purchase; do not route sandbox events into the production backend.
- Configure a judge-accessible free trial or promo code; a seven-day free trial is recommended.
- Complete and record a real sandbox purchase and restore on the target native device.
- Produce a connected signed iOS or Android build and perform physical-device checks for purchase, notifications, permissions, deep links, and private media. The completed Android demo APK proves the build pipeline only.
- Record and publicly upload the final device demo to YouTube or Vimeo.
- Confirm the Next Gen student email and target categories.
- Add the Auth SMTP sender, final connected-web URL/redirects, and any store metadata needed for the chosen release path. The current Vercel URL is an intentionally credential-free demo, not the connected consumer web app.

## Known Limitations

- The public demo intentionally simulates billing. RevenueCat's production webhook, server key, public Android keys, entitlement, offering, and Test Store products are configured, but store credentials and real receipt proof remain incomplete.
- A signed internal Android demo APK now exists; physical-device, connected native build, push-delivery, and real receipt evidence remain open release gates.
- Hosted Auth still needs a custom SMTP sender and final redirect configuration before consumer signup should be opened broadly.
- Group Kin Spaces, voice/video calls, message import, and automatic AI memory suggestions are explicitly out of scope for this focused first release.

## TODO Official Form Fields

Official requirements fetched live from Devpost on 2026-09-27.

| Field | Draft answer / action |
| --- | --- |
| Includes App Icon (required) | **Yes** after attaching `assets/brand/app-icon.png` (1024×1024). |
| Includes screenshot (required) | **Yes** after attaching at least one listed 1179×2556 frameless screenshot. |
| App type (required) | iOS and Android. |
| First Version Date Confirmation | Leave unchecked for the Next Gen path unless a store release lands by September 30, 2026. |
| Is Staff or Sponsor | Confirm **No** before final entry. |
| App Store / Google Play / Galaxy URL | Not required for the student Next Gen path; otherwise a published store URL is mandatory. |
| Next Gen code repository | <https://github.com/kaseyho/Kin> |
| Next Gen student/academic email | TODO — user must provide and confirm the academic email. |
| Minor entrant consent | TODO — confirm no minor entrant, or complete the official guardian form if applicable. |
| RevenueCat project ID (required) | `projc87474b5` |
| Premium judge access | TODO — configure a free trial or provide a promo code. |
| RevenueCat Design Award | Kin combines warm editorial typography, parchment-like relationship surfaces, relationship-specific themes, and a layered conversation-to-memory interaction. The design makes the emotional hierarchy visible: messages feel familiar, while Moments and timelines feel archival and intentionally kept. Interaction states remain explicit and accessible across phone and wide layouts. |
| RevenueCat Peace Prize | Kin is designed to help people preserve and revisit meaningful history with partners, close friends, and family without ads, public performance, relationship scoring, or selling intimate data. It gives distant families and busy relationships a private place to remember what was said, planned, and celebrated. |
| HAMM Award | Consider only after the live RevenueCat purchase gate passes. Kin+ monetizes deeper expression and preservation through premium themes and unlimited new Moments while leaving messaging and existing history free. |
| Additional notes for judges | The public demo is deterministic and uses fictional data. The final video will demonstrate the native RevenueCat purchase or restore path on-device. |
| Demo video URL (required) | TODO — public YouTube or Vimeo URL, at most two minutes. |

The live Devpost form does not ask for a Codex session ID, so none is included.
