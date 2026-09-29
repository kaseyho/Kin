# Kin — A Messenger That Remembers What Matters

## Inspiration

Messaging apps are excellent at helping us talk, but poor at helping us remember. The conversations that matter most — with a partner, best friend, parent, or sibling — eventually disappear inside thousands of messages. Photos, first dates, favourite places, plans, and small promises are still there, but retrieving and reliving them is work.

Every relationship also receives nearly the same generic chat interface. The history shared with a partner feels no more personal than a project group, even though those relationships carry very different meaning.

## What it does

Kin is a private messenger built around the relationship rather than the inbox. Each one-to-one Kin Space combines a familiar conversation with a second layer for the relationship itself.

A person can long-press any meaningful message and choose **Remember this**, then preserve it as a Moment, important date, or plan. Saved items appear in the relationship view and chronological timeline, retain a link to the source conversation, and can resurface through **On This Day**. Each Space can also have its own nickname, accent, wallpaper, shared media, and relationship sticker.

Key features include:

- private, invitation-based one-to-one Kin Spaces;
- text and image messages, reactions, timestamps, relationship stickers, realtime updates, retry, and offline states;
- **Remember this** for turning a source message into a Moment, date, or plan without losing its conversational context;
- relationship views, shared media, future plans, and a chronological timeline;
- **On This Day** anniversary resurfacing;
- per-relationship nicknames, accents, themes, and wallpapers;
- archive, leave, block, report, account export, and account deletion;
- private-by-default notifications with retry and receipt reconciliation; and
- a deterministic fictional demo story that never silently replaces connected production services.

Kin is intentionally not a public social network, relationship score, surveillance tool, or automated relationship coach. Ordinary messaging remains free, existing saved history remains available after a subscription ends, private conversations contain no ads, and relationship data is not sold.

## How we built it

Kin is a TypeScript application built with Expo SDK 57, React Native, and Expo Router for Android, iOS, and a browser-compatible demo.

The client depends on a `KinRepository` interface so the UI is not tied to one data provider. A local AsyncStorage adapter supplies the deterministic Maya-and-Jamie demo story. The connected implementation uses Supabase Auth, Postgres, Row Level Security, Realtime, private Storage, RPCs, Edge Functions, Cron, and Vault.

EAS owns the native build profiles. Isolated Supabase production and staging projects run in Singapore, and Vercel hosts the public demo. Production bundle validation rejects missing or wrong-platform public keys and checks that server secrets never enter client bundles.

## How RevenueCat powers Kin+

Kin+ adds unlimited creation of new Moments and relationship themes while leaving ordinary messaging and previously saved history available to everyone.

The native RevenueCat adapter identifies customers with the signed-in Supabase UUID. A signed, idempotent Supabase webhook refreshes RevenueCat's current subscriber state instead of trusting individual lifecycle events, then stores a private entitlement projection used for server-authoritative limits.

For judge testing, the standalone Android build uses an isolated staging backend and RevenueCat Test Store. Purchases are simulated, never charge real money, and create no real revenue. The build is intentionally debuggable because RevenueCat Test Store rejects non-debuggable binaries; it is not a production-store binary.

## Privacy and AI choices

Kin does not send private relationship content to a generative model and does not place an AI participant inside a relationship. Memory creation is explicit: a person chooses what to save, while deterministic date logic powers timeline ordering and On This Day resurfacing. This is a deliberate privacy and product decision.

AI was used during development to turn the product thesis into an implementation plan, evaluate edge cases, generate test scenarios, review interaction copy, and check whether monetization and recovery states stayed aligned with the emotional and privacy goals. The fictional demo story and original demo assets were also developed as a safe, non-personal narrative for repeatable testing and presentation.

## How we used Codex

Codex helped translate the product requirements into the Expo, Supabase, and RevenueCat architecture; implement test-driven slices for authentication, account lifecycle, invitations, messaging, Moments, personalization, safety, notifications, billing, and deployment; review RLS and privacy boundaries; build the RevenueCat adapters and webhook; create and inspect the brand assets and screenshots; and run CI-equivalent tests, browser journeys, bundle scans, deployment checks, and provider-boundary audits.

Codex also helped challenge ideas that weakened the product thesis. Relationship scoring, silent AI inference, public feeds, ads inside conversations, and locking old memories behind a subscription were deliberately excluded.

## Challenges we ran into

The hardest boundary was making premium access convenient without letting billing state become a client-side trust decision. RevenueCat remains the billing authority, while the server refreshes current subscriber state and applies limits from a private entitlement projection.

We also had to keep three environments honest: a deterministic public web demo, a connected staging Android build, and production services. Explicit environment labels, isolated projects, bundle validation, and separate adapters prevent demo behaviour from silently masking provider failures.

RevenueCat Test Store introduced one more constraint: it intentionally rejects nondebuggable apps. We therefore produced a standalone debuggable judge APK with an embedded JavaScript bundle, then verified that it cold-starts without Metro and completes purchase and restore in an Android 15 emulator.

## Accomplishments that we're proud of

- The central conversation-to-memory flow works end to end: message → **Remember this** → Moment → relationship view → timeline → On This Day.
- RevenueCat Test Store purchase and restore were verified in the native Android UI, and staging Supabase received the active `kin_plus` entitlement.
- The release gate passes 67 Jest suites / 340 app tests, 36 Edge Function and operator-tool tests, and 14 Playwright journeys, together with TypeScript, lint, web export, production bundle isolation, and dependency checks.
- The production backend includes eight migrations, 17 RLS-enabled public tables, private Storage, five active Edge Functions, and two scheduled workers.
- The public demo uses only fictional data and visibly labels simulated billing.

## What we learned

Relationship software benefits from restraint. The most useful memory feature was not automatic extraction; it was a clear, intentional action that preserves context. Monetization also feels more respectful when it expands future creation and expression without taking away messages or memories people already made.

Technically, we learned to treat purchase events as prompts to refresh authoritative state, keep client and server responsibilities explicit, and test provider boundaries separately from local application behaviour.

## What's next

The next production steps are real Google Play subscription products and receipt proof, physical-device push verification, and a custom SMTP sender before broad consumer signup. Longer-term ideas include group Kin Spaces, voice and video calls, and message import, but only where they preserve the relationship-first, privacy-conscious product direction.

## Try Kin

- **Public demo:** <https://kin-demo-five.vercel.app/?demo=story&demoDate=2026-12-05>
- **Source code:** <https://github.com/kaseyho/Kin>
- **Android judge build:** <https://github.com/kaseyho/Kin/releases/download/shipaton-2026-judge/kin-judge-staging-debuggable.apk>
- **Demo video:** <https://youtu.be/HWi-CvJgEjA>

In the public demo, open Jamie's Kin Space, select “December 5 was honestly the best first date,” choose **Remember this**, save it as a Moment, then open **Relationship with Jamie** and **Our timeline**. The web checkout is visibly simulated; use the Android judge build for the real RevenueCat Test Store purchase and restore flow.
