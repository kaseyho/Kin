# RevenueCat dashboard configuration evidence

Date verified: 2026-09-29

This record contains provider identifiers and configuration state only. Public SDK keys, server API
keys, webhook authorization, webhook signing material, receipts, and customer identifiers must not
be recorded here.

## Verified configuration

| Resource | Verified state |
| --- | --- |
| Project | `Kin`, RevenueCat Project ID `projc87474b5` |
| Required entitlement | `kin_plus` (`Kin+ Access`) exists and has all three Test Store products attached |
| Current offering | `default`, with three packages created by the RevenueCat onboarding flow |
| Test Store products | `monthly`, `yearly`, and `lifetime`; each is attached to `kin_plus` |
| Android app | `Kin (Play Store)`, REST ID `app80bdbc7ec4`, package `com.kaseyho.kin` |
| Android SDK key | A platform-specific `goog_` public key exists; its value is intentionally not recorded |
| EAS public billing values | Preview has the Test Store Android key; production has the Google Android key; both values are stored as sensitive EAS variables |
| Restore behavior | `Transfer if there are no active subscriptions`, with no separate sandbox override |
| Sandbox access | Anybody may receive Test Store entitlements while the release gate is being exercised |
| Server API key | A dedicated RevenueCat v1 key named `Kin Supabase webhook` is stored in macOS Keychain and both matching Supabase secret stores |
| Production webhook | `Kin production` (`whintgrfd8bbd1178`) targets the hosted Supabase Edge Function, sends production events only, and has HMAC signing enabled |
| Staging webhook | `Kin staging` (`whintgr165309bbec`) targets isolated staging, sends sandbox events only, and has HMAC signing enabled |

The onboarding flow's unused legacy `kin` entitlement was detached from its three products and
permanently deleted after explicit approval. `kin_plus` remains the only entitlement and retains all
three Test Store products.

The production webhook includes `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `CANCELLATION`,
`BILLING_ISSUE`, `NON_RENEWING_PURCHASE`, `UNCANCELLATION`, `SUBSCRIPTION_PAUSED`, `EXPIRATION`,
`SUBSCRIPTION_EXTENDED`, `INVOICE_ISSUANCE`, and `REFUND_REVERSED`. Transfer, temporary grants,
virtual-currency, experiment, and purchase-redemption events remain excluded by design. Its exact
authorization value and one-time HMAC secret are stored only in macOS Keychain and Supabase.

After secret rotation, `revenuecat-webhook` was redeployed as active version 5. A correctly
authorized and signed request to the hosted endpoint reached schema validation and returned the
expected `400 event_invalid` response for the intentionally incomplete `{}` body. This proves the
deployed authorization and HMAC path without creating or recording a customer event.

The account email was confirmed and the warning banner no longer appears after a fresh dashboard
reload. The staging webhook uses the same 12-event lifecycle filter and deliberately excludes the
same reduced-identity event families as production. RevenueCat's signed synthetic `TEST` event
reached staging and returned the expected `400 event_invalid`, proving the staging Authorization
and HMAC boundary without creating a subscriber projection.

## Open provider gates

- The Google Play app is missing the Play Console service-account JSON, so RevenueCat cannot yet
  validate real Play transactions or enable Google developer notifications.
- The App Store app cannot be saved until the App Store Connect in-app-purchase `.p8` key, Key ID,
  and Issuer ID are supplied.
- RevenueCat Web Billing has no provider because Stripe is not connected.
- A real sandbox purchase, restore, entitlement projection, and physical-device run remain required
  before production billing can be approved.

This is dashboard-configuration evidence, not proof of a purchase or entitlement lifecycle.
