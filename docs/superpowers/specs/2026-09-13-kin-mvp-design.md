# Kin Relationship-First Messenger MVP Design

**Date:** 2026-09-13  
**Status:** Approved architecture, pending implementation plan  
**Product source:** Kin PRD v0.1  
**Target:** Mobile-first Expo application for iOS and Android, with a browser-compatible demo surface

## Product intent

Kin is a private messenger for a user's closest relationships. Its defining unit is the Kin Space: a familiar one-to-one conversation combined with a persistent relationship layer containing personalization, saved Moments, meaningful dates, plans, and a chronological timeline.

The MVP must prove one emotional hypothesis: an important message can become lasting relationship context and later be rediscovered. It is not intended to reproduce the breadth of WhatsApp, become a public social network, score relationships, or use AI to interpret people.

## Success experience

The primary demonstration is one coherent story:

1. Maya creates or joins a Kin Space with Jamie.
2. She exchanges text and image messages and reacts to a message.
3. She gives Jamie a nickname and selects a relationship accent and wallpaper.
4. She long-presses an older message and chooses **Remember this**.
5. She turns the message into a Moment named **Our first date**, preserving its date and source message.
6. The Moment immediately appears in the relationship panel and chronological timeline.
7. An **On this day** card resurfaces the Moment when its month and day match a prior year.
8. She opens Kin+ and sees relationship themes and unlimited Moments as expressive upgrades, while messaging and existing memories remain accessible for free.

The flow succeeds when a viewer can understand “WhatsApp stores messages; Kin remembers relationships” without explanation of the underlying infrastructure.

## Scope

### Required P0

- Create a local profile with name and avatar.
- Create a Kin Space and join one through a short invitation code or link payload.
- Show a chat-list landing screen.
- Open a one-to-one Kin Space.
- Send and receive text messages and display timestamps.
- Personalize a Kin Space with a nickname, accent, and wallpaper; changes persist.
- Long-press a message to open **Remember this**.
- Save a source message as a Moment, important date, or plan.
- Show saved items in the Kin Space relationship panel.
- Show Moments chronologically on a relationship timeline.
- Open a Moment to see its title, date, note, source message, and attached media.
- Offer a Kin+ purchase surface backed by RevenueCat on configured native builds.
- Unlock at least one meaningful premium capability: premium relationship themes and unlimited Moments.

### Included P1 for a polished proof

- Send an image message.
- React to a message.
- Surface an **On this day** card for a matching Moment from a previous year.
- Show upcoming saved dates and plans in the relationship panel.
- Include a small relationship-specific sticker collection with a seeded demonstration sticker.

### Deferred

- Automatic memory inference or AI suggestions.
- Rich semantic search.
- Groups, calls, voice notes, typing indicators, forwarding, read receipts, and large-scale messaging parity.
- Chat-history imports, location sharing, public profiles, channels, bots, or desktop-specific functionality.
- Joint live editing rules beyond ordinary shared Space membership.
- Production push notifications and cross-device delivery guarantees.
- Relationship analytics, scores, guilt-oriented prompts, or advertising.

## Architectural approach

The app uses Expo, React Native, TypeScript, and Expo Router. Product code depends on repository and billing interfaces rather than directly on Supabase or RevenueCat. Two concrete runtime modes implement those interfaces:

1. **Demo mode**, enabled when service credentials are absent, stores data locally and includes a seeded Maya/Jamie relationship. Every required product flow remains usable and testable without an external account.
2. **Connected mode**, enabled by environment configuration, uses Supabase Auth, Postgres, Realtime, and Storage. RevenueCat supplies Kin+ entitlement state on native development and production builds.

Demo mode is not a visual mock. It exercises the same domain commands, validation, screens, and selectors as connected mode. The adapter boundary lets the project remain runnable locally while preserving a credible path to real multi-user messaging and purchases.

## Project structure

```text
src/
  app/                    Expo Router routes and layouts
  features/
    onboarding/           Profile creation and first Kin Space entry
    chats/                Chat list, conversation, composer, reactions
    spaces/               Create/join, relationship panel, personalization
    moments/              Remember flow, editor, detail, timeline, resurfacing
    premium/              Kin+ offer, entitlement, restore and upgrade UI
    profile/              Account, privacy, demo reset and settings
  domain/
    models.ts             Product entities and shared value types
    commands.ts           Pure validated mutations
    selectors.ts          Timeline, upcoming and On-this-day derivations
    limits.ts             Free and Kin+ capability rules
  data/
    contracts.ts          Repository interfaces
    demo/                 Seed data and persistent local adapter
    supabase/             Client, repositories and realtime subscriptions
  services/
    billing/              Demo and RevenueCat implementations
    media/                Image selection/upload abstraction
  design/                 Tokens, typography, themes and motion constants
  components/             Reusable product-specific UI primitives
supabase/
  migrations/             Tables, indexes, triggers and RLS policies
assets/                   Fonts, wallpapers, avatars and demo media
tests/                    Cross-feature integration and acceptance tests
```

Each feature owns its screens and feature-specific components. Pure domain behavior stays independent of React Native, Supabase, and RevenueCat so it can be tested without native infrastructure.

## Domain model

### UserProfile

- `id`
- `displayName`
- `avatarUri`
- `createdAt`

### KinSpace

- `id`
- `createdBy`
- `inviteCode`
- `createdAt`
- `relationshipStartDate` (optional)
- `members`
- `theme`

### SpaceMember

- `spaceId`
- `userId`
- `nickname` (the name this user sees for the other participant)
- `joinedAt`
- `role`

### RelationshipTheme

- `accentId`
- `wallpaperId`
- `isPremium`

The MVP stores theme selection per viewing user. Shared collaborative customization is deliberately deferred because the PRD identifies ownership as unresolved.

### Message

- `id`
- `spaceId`
- `senderId`
- `kind`: `text | image | sticker`
- `body`
- `mediaUri` (optional)
- `createdAt`
- `replyToId` (reserved, unused by MVP)
- `reactions`
- `deliveryState`: `sending | sent | failed`

### Reaction

- `emoji`
- `userId`
- `createdAt`

### MemoryItem

- `id`
- `spaceId`
- `createdBy`
- `kind`: `moment | important_date | plan`
- `visibility`: `private | shared`
- `title`
- `occurredOn`
- `note`
- `place` (optional)
- `sourceMessageIds`
- `mediaUris`
- `createdAt`
- `updatedAt`

The interface calls every `moment` item a Moment and uses the human labels **Important date** and **Plan** for the other kinds. `visibility` defaults to `private`; the user must deliberately choose shared storage.

### EntitlementState

- `isKinPlus`
- `source`: `demo | revenuecat | unavailable`
- `expiresAt` (optional)

## Navigation and screen design

### App entry and onboarding

First-time users see a short two-screen introduction: “Your chats contain more than messages” and “Kin helps you remember what matters.” They then create a basic profile and either create their first Kin Space or join using an invite code. Returning users go directly to Chats.

### Primary navigation

The bottom navigation contains:

- **Chats** — primary landing surface and Kin Space entry.
- **Moments** — a cross-relationship resurfacing feed and all saved Moments.
- **Profile** — account, Kin+, privacy explanation, and demo controls.

People is omitted as a separate tab because the early product contains only a handful of close relationships and the chat list already represents them.

### Chat list

Each row prioritizes the person, most recent message, timestamp, relationship-specific accent, and an optional quiet memory marker. A floating **New Kin Space** action opens Create or Join. Empty state copy leads directly to the first Space rather than showing a generic blank list.

### Kin Space conversation

The conversation preserves familiar messaging ergonomics: compact message grouping, clear sender distinction, timestamps, image bubbles, reactions, and a persistent composer. The header shows the relationship nickname and opens the relationship panel.

A single contextual **On this day** card may appear between date groups. It never competes with recent messages or implies judgment. Long-pressing a message opens a bottom action sheet with **Remember this**, reactions, and cancel.

### Remember flow

The first sheet asks what the message should become: Moment, Important date, or Plan. The editor then shows the source message, title, relevant date, optional note, visibility, and media. Saving gives immediate feedback and links to the new item. Validation stays inline; cancelling preserves the original conversation state.

### Relationship panel and timeline

The relationship panel is the product's signature secondary surface. It contains:

- relationship identity and personalization;
- **On this day**, if relevant;
- upcoming important dates and plans;
- recent Moments;
- a button to open the full timeline;
- shared media and stickers previews;
- Kin+ theme entry.

The timeline groups saved items by year and orders them by `occurredOn`, with distinctive Moment cards that combine message excerpts, media, and short notes. It avoids charts, scores, and dashboard metrics.

### Kin+

The paywall explains premium as deeper expression and preservation. Free users can message, use basic themes, and save up to five new Moments per Kin Space. Kin+ unlocks premium themes and unlimited new Moments. Any Moment created while subscribed remains readable and editable after entitlement loss; only creation beyond the free limit and new premium-theme selection are gated.

## UX decision brief

- **Job:** Communicate with someone close, preserve a meaningful exchange, and rediscover it later.
- **User mode:** First-time onboarding followed by daily returning use.
- **Frequency/risk:** Daily and emotionally sensitive; edits are reversible, privacy mistakes are high-risk.
- **Pattern:** Familiar chat with progressive disclosure into a relationship panel and timeline.
- **Primary action:** Send a message in Chat; save from **Remember this** when context matters.
- **Secondary actions:** React, attach an image, personalize, browse timeline, upgrade.
- **Core path:** Chats → Kin Space → message → long-press → Remember this → save → relationship panel/timeline → resurface.
- **Recovery path:** Preserve editor input on validation failure, retry failed messages, allow Moment edit/delete, explain unavailable connected services, restore purchases.
- **Required states:** First-use empty, loading, partial media failure, offline/failed send, permission denied, validation error, save success, unavailable billing, and restore success/failure.
- **Handoff constraints:** The relationship remains the primary object; AI stays absent; private is the default; messaging cannot be paywalled.

## UI decision brief

- **Surface type:** Native-feeling consumer messenger with a memory-layer reveal, not a dashboard.
- **Visual direction:** Warm editorial scrapbook refined into a quiet premium mobile product.
- **Hierarchy:** Conversation is dominant; relationship context is one deliberate level deeper; monetization remains tertiary.
- **Palette:** Warm parchment neutrals and dark plum ink, with a user-selected relationship accent. Theme choices must preserve text contrast.
- **Typography:** A characterful editorial display face for Moment titles paired with a highly legible humanist sans for messages and controls.
- **Component grammar:** Softly rounded message bubbles, edge-to-edge media, paper-like Moment cards, fine keylines, and restrained shadows.
- **Signature motif:** A small “kept” corner fold appears on preserved source messages and expands into the Moment card reveal.
- **Forbidden defaults:** Generic gradient hero cards, dashboard grids, excessive pills, glassmorphism, engagement statistics, confetti, and productivity language.
- **Motion budget:** 160–260 ms for sheets, saved-state transitions, and the kept-corner reveal; respect reduced-motion settings and avoid decorative infinite motion.
- **Responsive behavior:** Phone-first; larger widths center a bounded conversation column while the relationship panel can coexist alongside it.
- **Assets:** Bundled demo avatars, one relationship wallpaper set, one seeded photo Moment, and one relationship sticker; no remote image dependency for the core demo.

## Data flow and state

Screens invoke feature actions that call a `KinRepository` interface. Repository writes return canonical entities and emit subscriptions for affected Spaces. Query state owns remote/cache status; ephemeral interface state remains local to each screen.

Sending a message is optimistic:

1. Create a local message with `deliveryState: sending`.
2. Render it immediately.
3. Persist through the active repository.
4. Replace it with the canonical `sent` entity on success.
5. Mark it `failed` and expose Retry on failure.

Saving a MemoryItem is not optimistic because privacy and date fields must be confirmed. The editor remains open during persistence and closes only after a canonical item returns.

Connected realtime updates are scoped to Spaces in which the authenticated user has membership. Demo mode simulates a remote reply deterministically so the receive-message experience is demonstrable without hidden timers in tests.

## Local persistence

Demo mode serializes a versioned snapshot through AsyncStorage. The adapter supports profile, Space, message, reaction, theme, and MemoryItem operations plus deterministic reset to seed data. Migrations transform old snapshots before they enter the domain layer. Corrupt snapshots fail closed to a recoverable reset screen rather than silently overwriting data.

## Supabase design

Connected mode uses these tables:

- `profiles`
- `kin_spaces`
- `kin_space_members`
- `space_themes`
- `messages`
- `message_reactions`
- `memory_items`
- `memory_item_messages`
- `space_invites`

Storage buckets hold chat media and avatars. Every table enables Row Level Security. Policies require authenticated membership for shared Space reads and writes, and `created_by = auth.uid()` for private MemoryItems. Invite redemption occurs through a database function that validates expiration and use count without exposing member data. Realtime subscriptions never broaden those policies.

Environment values are read from uncommitted Expo public configuration for the Supabase project URL and publishable key. No service-role key enters the application bundle.

## RevenueCat design

`PremiumService` exposes entitlement observation, offerings, purchase, and restore. Native configured builds use RevenueCat's React Native SDK with the `kin_plus` entitlement. Browser and credential-free development use an explicit demo service whose state is clearly labeled in Profile.

The RevenueCat SDK is loaded behind a platform-aware boundary so browser export and ordinary Expo development do not crash when native billing is unavailable. Actual iOS and Android purchase verification requires configured store products, RevenueCat keys, and an Expo development build; local tests verify the boundary and gating rules, not a real financial transaction.

## Privacy and safety

- Relationship data is never public by default.
- Remembered content defaults to private and shows its source: “From your message on …”.
- Shared visibility requires an explicit user choice.
- Users can edit and permanently delete their MemoryItems.
- Connected-mode membership gates all message and Space access.
- No advertising, relationship scoring, activity surveillance, guilt reminders, or silent sensitive inference exists.
- Archive, leave, block, and whole-Space deletion are represented in the repository contract but only archive and local demo deletion receive MVP interfaces; production interpersonal safety flows require further policy work.
- Theme and wallpaper choices cannot reduce message contrast below accessible levels.

## Error handling and recovery

- Repository failures return typed errors with a human action: retry, reconnect, re-enter invite, or reset corrupt demo data.
- Message send failures remain visible in place and can be retried without duplicating content.
- Image permission denial explains why access is needed and leaves text messaging usable.
- Invalid or expired invites keep the entered code and permit correction.
- Moment validation identifies missing title or invalid date next to the field.
- Billing unavailable and purchase cancellation are not treated as fatal errors; restore remains available.
- Empty and partial states always retain a direct path to the next useful action.

## Accessibility and interaction constraints

- Interactive targets are at least 44 by 44 points.
- Text supports dynamic scaling without clipping the composer or action sheets.
- Color is never the only signal for message ownership, delivery, premium status, or errors.
- Modal sheets announce titles, trap focus appropriately on web, and return focus on close.
- Long-press actions also have an accessible menu action so the Remember flow is not gesture-only.
- Reduced-motion settings replace the kept-corner reveal with an immediate state change.
- Image messages and Moment media support concise accessibility labels.

## Testing strategy

Implementation follows red-green-refactor.

### Unit tests

- Domain commands reject invalid invites, Moments, dates, and unauthorized mutations.
- Timeline selectors order mixed MemoryItems correctly.
- On-this-day matching handles year boundaries and excludes the current year.
- Upcoming selectors calculate future dates without guilt-oriented overdue copy.
- Kin+ limits never hide existing Moments after downgrade.
- Snapshot migration and corrupt-data recovery preserve safe defaults.

### Component tests

- Chat list empty and populated states.
- Composer send, failed state, and retry.
- Long-press/accessibility action → Remember sheet.
- Moment validation, visibility default, and save success.
- Relationship personalization persistence.
- Paywall unavailable, purchase, cancellation, restore, and entitlement states.

### Integration tests

- Create profile → create Space → send message.
- Join an invited Space through a valid code.
- Remember message → Moment appears in panel and timeline → detail opens source content.
- Prior-year Moment → On-this-day card → detail.
- Free limit → Kin+ offer → demo entitlement unlock.

### Build and visual verification

- TypeScript type-check, lint, unit/component/integration suites, and formatting checks.
- Expo browser export proves route and platform-safe module loading.
- Browser-driven checks verify the principal phone viewport flow and one wider responsive state.
- Screenshots cover onboarding, chat, Remember sheet, relationship panel, timeline, and Kin+.
- Native RevenueCat purchase success remains an external verification gate until store and RevenueCat credentials are supplied.

## Acceptance criteria

The MVP is accepted when:

1. A clean install can create a profile and a Kin Space or join through a valid invitation.
2. The chat list is the primary returning-user screen.
3. A user can send text and image messages, receive the deterministic demo reply or a connected realtime reply, react, and see timestamps.
4. Nickname, accent, and wallpaper changes visibly affect only the selected relationship and survive restart.
5. Long-press and accessible alternatives expose **Remember this**.
6. A message can become a private-by-default Moment, important date, or plan.
7. Saved Moments appear chronologically, open their source content, and can be edited or deleted.
8. Matching prior-year Moments produce a restrained **On this day** surface.
9. Upcoming important dates and plans appear without guilt-oriented language.
10. Free users retain messaging and readable existing Moments; Kin+ unlocks premium themes and unlimited new Moments.
11. Demo mode works without credentials; connected adapters fail clearly rather than silently pretending to be live.
12. Automated checks pass and the core flow is visually verified at representative phone and wide layouts.

## Known external gates

- A real Supabase project and publishable credentials are required to prove cross-device authentication, realtime delivery, Storage uploads, and deployed RLS behavior.
- RevenueCat, App Store Connect, and/or Google Play product configuration plus an Expo development build are required to prove a real purchase and restore.
- Native device checks are required for image permissions, keyboard behavior, haptics, safe areas, and real store billing.

These gates do not change the app's required integration code or local demo behavior. Final reporting must distinguish automated/local evidence from unperformed provider and device proof.
