# Kin store listing draft

Status: **copy prepared; external store configuration and final legal contact are not complete**.

This file is the source copy for App Store Connect and Google Play Console. Recheck each console's
current character counters before pasting. Do not mark the release ready until every field in the
release checklist has provider-side evidence.

## Product copy

**App name**

Kin

**Apple subtitle**

Closer, one message at a time

**Google Play short description**

A private place for two people to talk, remember, and stay close.

**Promotional text**

Talk naturally, save the messages that matter, and rediscover your shared story — in one private
space made for the two of you.

**Full description**

Kin is a private messenger built around one relationship at a time.

Chat without feeds, follower counts, or public profiles. Save meaningful messages and photos as
Moments, keep them private or share them with your person, and return to your story through a calm
timeline made for the two of you.

With Kin you can:

- create a private Kin Space for one close relationship;
- send messages, photos, and reactions in real time;
- remember meaningful messages as private or shared Moments;
- revisit shared memories in a relationship timeline;
- choose relationship themes and wallpapers;
- control notifications, export your data, and delete your account;
- block, report, leave, or archive a Kin Space when needed.

Kin has no public profile, advertising, relationship score, or silent relationship analysis. Your
private relationship content is not sent to an AI model.

Kin+ unlocks premium themes and unlimited Moments. Prices, trial availability, billing period, and
renewal terms are shown before purchase. Subscriptions can be managed through the store or billing
provider used to purchase.

**Search terms / keywords**

relationship, couples, friendship, private messenger, memories, shared journal, moments

**Primary category candidates**

- Apple: Social Networking
- Google Play: Social

## Public URLs

Replace `PUBLIC_URL` only after the stable connected-production host and support mailbox are
approved. The pages themselves are implemented as public, signed-out routes.

| Store field | URL |
| --- | --- |
| Marketing / app URL | `PUBLIC_URL/` |
| Privacy policy | `PUBLIC_URL/privacy` |
| Terms of use | `PUBLIC_URL/terms` |
| Community standards | `PUBLIC_URL/community-standards` |
| Support | `PUBLIC_URL/support` |
| External account deletion | `PUBLIC_URL/account-deletion` |

## Review notes draft

Kin is a two-person relationship messenger. Review should cover:

1. Sign in with the supplied review account using the six-digit email OTP.
2. Open the existing Kin Space from Chats.
3. Send a message and reaction, then open a message's actions and choose **Remember this**.
4. Save it as a shared Moment and open **Relationship → Timeline**.
5. Open **Kin+** and verify the RevenueCat purchase sheet, purchase/restore behavior, and entitlement
   state with the supplied sandbox account.
6. Open **Profile** to review notification controls, export, account deletion, and all legal/support
   pages.
7. Open **Relationship** to review archive, leave, block, and report controls.

The backend must remain live throughout review. Supply a reusable review account or a review inbox
that the reviewer can access; never put a private developer OTP or personal password in this file.

## Privacy-declaration working map

Use this as a console-entry checklist, not as a substitute for answering the live Apple or Google
questionnaire.

| Data group | Kin use | Linked to account | Tracking / advertising |
| --- | --- | --- | --- |
| Email and profile details | Authentication and profile | Yes | No |
| Messages, photos, reactions, Moments | Core relationship features | Yes | No |
| Customer ID, products, entitlement, purchase events | Kin+ access and support | Yes | No |
| Push token, preferences, delivery status | Notifications | Yes | No |
| Support and safety reports | Support, safety, abuse prevention | Yes | No |
| Limited technical records | Security, reliability, troubleshooting | May be | No |

Kin uses Supabase, RevenueCat, Expo push services, and Apple/Google delivery or purchase systems as
described in the in-app Privacy Policy. No advertising or behavioral analytics SDK is included.

## Release checklist

- [x] 1024×1024 icon exists and passes the local asset verifier.
- [x] Frameless 1179×2556 submission screenshots exist under `output/playwright/screenshots/`.
- [x] Privacy, terms, standards, support, and deletion routes exist and work while signed out.
- [ ] Final connected-production public host is approved and deployed.
- [ ] Public support mailbox is approved, configured, and tested end-to-end.
- [ ] Legal/operator identity and final policy text receive owner/legal review.
- [ ] Apple age rating, privacy nutrition labels, content rights, and export-compliance answers are
  completed in App Store Connect.
- [ ] Google Data safety, content rating, target audience, ads, and account-deletion declarations are
  completed in Play Console.
- [ ] Apple and Google subscription products, offers, pricing, localization, and review screenshots
  match RevenueCat.
- [ ] Production iOS and Android builds succeed from the exact release commit.
- [ ] TestFlight and Play internal-test builds pass the physical-device acceptance checklist.
- [ ] RevenueCat sandbox purchase, restore, webhook, entitlement, and cancellation behavior is
  recorded on a physical device.
- [ ] A reviewer-accessible account/inbox and complete review notes are entered.
- [ ] Store screenshots and copy are previewed on all selected device classes and locales.
