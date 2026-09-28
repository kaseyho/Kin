# Public demo support deployment evidence

Date verified: 2026-09-29

## Deployment result

| Field | Evidence |
| --- | --- |
| Vercel project | `kin-demo` |
| Deployment | `dpl_8fNrPmSEH95gDQQt11fhP8Nc893u` |
| Status | `READY`, production |
| Stable alias | <https://kin-demo-five.vercel.app> |
| Public support email | `kaseyho.work@gmail.com` |

The production build used the checked-in `vercel.demo.json` configuration and the explicit demo
profile. Its build-time support email and public URL were supplied as public values; no Supabase or
RevenueCat credential entered this deployment.

## Live checks

The stable alias returned HTTP 200 for:

- `/`
- `/support`
- `/space/space-maya-jamie?demoDate=2026-12-05`

The rendered Support page displayed a link labelled
`Email Kin support at kaseyho.work@gmail.com`. This is a credential-free demo deployment and is not
evidence of connected Auth, private data, or real billing.
