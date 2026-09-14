# Kin MVP acceptance evidence

Date: 2026-09-14

This audit maps the twelve accepted MVP criteria to local implementation and automated evidence. It deliberately keeps provider and device proof separate from local completeness.

| # | Acceptance criterion | Implementation evidence | Automated evidence | Result |
|---|---|---|---|---|
| 1 | Create a profile and Kin Space, or join a valid invitation | `src/features/onboarding/OnboardingScreen.tsx`, `src/features/spaces/CreateJoinSpaceScreen.tsx`, `src/data/demo/DemoKinRepository.ts` | `tests/acceptance/activation.test.tsx`; `src/data/demo/__tests__/DemoKinRepository.test.ts` — valid and recoverable invalid invitation cases | Implemented and locally verified |
| 2 | Chat list is the returning-user home | `app/index.tsx`, `app/(tabs)/chats.tsx`, `src/features/chats/ChatListScreen.tsx` | `src/features/chats/__tests__/ChatListScreen.test.tsx`; `e2e/responsive.spec.ts` — opens the seeded relationship from the primary route | Implemented and locally verified |
| 3 | Send text/image, receive, react, and see timestamps | `src/features/chats/ChatScreen.tsx`, `src/features/chats/MessageBubble.tsx`, `src/data/demo/DemoKinRepository.ts`, `src/data/supabase/SupabaseKinRepository.ts` | `tests/acceptance/messaging.test.tsx`; `src/features/chats/__tests__/ChatScreen.test.tsx`; `src/features/chats/__tests__/MessageBubble.test.tsx` | Demo behavior locally verified; hosted realtime not externally verified |
| 4 | Nickname, accent, and wallpaper are relationship-scoped and persistent | `src/features/spaces/PersonalizeSpaceSheet.tsx`, `src/features/chats/ChatScreen.tsx`, `src/features/spaces/RelationshipPanel.tsx` | `tests/acceptance/personalization.test.tsx`; `src/features/spaces/__tests__/PersonalizeSpaceSheet.test.tsx`; `src/data/demo/__tests__/DemoKinRepository.test.ts` — persistence across repository instances | Implemented and locally verified |
| 5 | Long-press and accessible alternatives expose Remember this | `src/features/chats/MessageBubble.tsx`, `src/features/chats/MessageActionSheet.tsx`, `src/components/AccessibleSheet.tsx` | `src/features/chats/__tests__/ChatScreen.test.tsx`; `e2e/kin-flow.spec.ts` — right-click plus keyboard open, focus trap, Escape, and focus return | Implemented and locally verified |
| 6 | A message becomes a private-by-default Moment, important date, or plan | `src/features/moments/RememberSheet.tsx`, `src/features/moments/MemoryEditorScreen.tsx`, `src/domain/commands.ts` | `tests/acceptance/remember-message.test.tsx`; `src/domain/__tests__/commands.test.ts`; `src/features/moments/__tests__/MemoryEditorScreen.test.tsx` | Implemented and locally verified |
| 7 | Saved Moments are chronological, open source content, and support edit/delete | `src/features/moments/TimelineScreen.tsx`, `src/features/moments/MomentDetailScreen.tsx`, `src/features/moments/MomentCard.tsx` | `src/features/moments/__tests__/TimelineScreen.test.tsx`; `e2e/kin-flow.spec.ts` — save, rediscover, and open timeline | Implemented and locally verified |
| 8 | Earlier-year calendar matches produce On this day | `src/domain/selectors.ts`, `src/features/moments/OnThisDayCard.tsx`, `src/features/spaces/RelationshipPanel.tsx` | `tests/acceptance/on-this-day.test.tsx`; `src/domain/__tests__/selectors.test.ts`; `src/features/moments/__tests__/OnThisDayCard.test.tsx` | Implemented and locally verified |
| 9 | Upcoming dates/plans avoid guilt language | `src/domain/selectors.ts`, `src/features/moments/UpcomingList.tsx`, `src/features/spaces/RelationshipPanel.tsx` | `src/domain/__tests__/selectors.test.ts`; `tests/acceptance/on-this-day.test.tsx`; `src/features/spaces/__tests__/RelationshipPanel.test.tsx` | Implemented and locally verified |
| 10 | Messaging and existing Moments remain free; Kin+ unlocks themes and unlimited new Moments | `src/domain/limits.ts`, `src/features/premium/KinPlusScreen.tsx`, `src/features/premium/usePremiumGate.ts`, `src/services/billing/` | `tests/acceptance/kin-plus.test.tsx`; `src/domain/__tests__/limits.test.ts`; `src/features/premium/__tests__/KinPlusScreen.test.tsx`; `src/services/billing/__tests__/demo.test.ts` | Demo entitlement locally verified; store purchase not externally verified |
| 11 | Demo needs no credentials; connected mode fails clearly | `src/config/environment.ts`, `src/data/createRepository.ts`, `src/data/supabase/`, `src/components/InlineNotice.tsx` | `src/config/__tests__/environment.test.ts`; `src/data/__tests__/createRepository.test.ts`; `tests/acceptance/non-happy-states.test.tsx`; browser-safe Expo export | Implemented and locally verified; hosted adapter behavior not externally verified |
| 12 | Automated gates and representative phone/wide visual proof pass | `playwright.config.ts`, `e2e/kin-flow.spec.ts`, `e2e/responsive.spec.ts` | `npm run verify`; `npm run e2e`; `git diff --check` | Locally verified on the final tree |

## Final local verification

- `npm run verify`: TypeScript, Expo lint, 31 Jest suites / 73 tests, and Expo web export completed with zero failures.
- `npm run e2e`: 5 Playwright tests completed with zero failures at 390×844 and 1180×820.
- Reviewed screenshots under `output/playwright/test-results/` cover onboarding, conversation, Remember sheet, relationship panel, timeline, Kin+, and the wide split layout.
- `git diff --check`: no whitespace errors.

## Explicitly not externally verified

- Supabase: no configured hosted project was supplied. Cross-device authentication, hosted realtime, private Storage delivery, and deployed RLS behavior remain unproven. The migration and SQL assertions are present under `supabase/`; the local Docker daemon was unavailable, so `supabase db reset` and `supabase test db` were not run.
- RevenueCat and stores: no App Store Connect or Google Play products, RevenueCat project, public platform keys, receipts, or Expo development build were supplied. Real purchase and restore remain unproven.
- Native devices: image permission sheets, native keyboard/safe-area behavior, haptics, and real-store billing remain unproven on physical iOS and Android devices.

These external gates do not count as passing local evidence. The repository is integration-ready for those configured environments.
