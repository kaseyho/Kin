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
| Restore behavior | `Transfer if there are no active subscriptions`, with no separate sandbox override |
| Sandbox access | Anybody may receive Test Store entitlements while the release gate is being exercised |

The onboarding flow also created a legacy `kin` entitlement attached to the same Test Store
products. The app and webhook intentionally read only `kin_plus`; removal of the legacy entitlement
is a separate destructive dashboard action and has not been performed without explicit approval.

## Open provider gates

- The RevenueCat account reports that its email address is not yet confirmed.
- The Google Play app is missing the Play Console service-account JSON, so RevenueCat cannot yet
  validate real Play transactions or enable Google developer notifications.
- The App Store app cannot be saved until the App Store Connect in-app-purchase `.p8` key, Key ID,
  and Issuer ID are supplied.
- RevenueCat Web Billing has no provider because Stripe is not connected.
- The webhook form is prepared but not submitted. Completing it requires transmitting the existing
  webhook authorization value to RevenueCat, enabling HMAC signing, retaining the generated signing
  secret, and creating or supplying a RevenueCat v1 secret API key for the Supabase function.
- A real sandbox purchase, restore, entitlement projection, and physical-device run remain required
  before production billing can be approved.

This is dashboard-configuration evidence, not proof of a purchase or entitlement lifecycle.
