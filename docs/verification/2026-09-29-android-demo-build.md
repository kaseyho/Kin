# Android internal demo build evidence

Date verified: 2026-09-29

## Build result

| Field | Evidence |
| --- | --- |
| EAS build | [`15c01a0b-e419-4023-ab16-9dab5e5c8864`](https://expo.dev/accounts/moondrunk/projects/kin/builds/15c01a0b-e419-4023-ab16-9dab5e5c8864) |
| Status | `FINISHED` |
| Platform and distribution | Android, internal distribution |
| Build profile | `demo` |
| Source commit | `0360804218820b4fc366a993eb26731db18d3976` (`chore: add internal demo build profile`) |
| Application ID | `com.kaseyho.kin` |
| App version | `1.0.0` (`versionCode` 1) |
| Expo SDK | 57.0.0 |
| Build fingerprint | `f9ec7c6da78fa6de8cea374356958139d81d4811` |
| Completed | 2026-09-27 10:22:37 UTC |
| Artifact expiry | 2026-10-11 10:02:49 UTC |

The generated APK is available from the EAS build page while the internal artifact remains active.
The build is an explicit demo deployment: it contains the fictional Maya-and-Jamie story and a
clearly labelled simulated Kin+ entitlement, with no consumer account or production billing
credentials.

## Proof boundary

This result proves that the exact source commit can be compiled by EAS into an installable Android
APK with the intended package identity. It does **not** prove physical-device installation,
rendering, permissions, notifications, deep links, private media, Supabase connectivity, or a real
RevenueCat purchase/restore. Those gates require installation on a target Android device and, for
connected billing, store and provider credentials plus a real sandbox receipt.
