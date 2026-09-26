# Kin public demo deployment evidence

Date: 2026-09-27

Source commit: `8c47bea` (`chore: configure public demo deployment`)

## Deployment

- Provider/project: Vercel `ho-kei-chings-projects/kin-demo`
- Production deployment: `dpl_AkTyHaMGikNxwmtFzRCwLRYTpCGV`
- Stable public URL:
  <https://kin-demo-five.vercel.app/?demo=story&demoDate=2026-12-05>
- Build: clean remote `npm ci` followed by `npm run export:web:demo`
- Routing: filesystem-first static assets plus SPA fallback from `vercel.demo.json`

This is the credential-free, visibly labelled hackathon demo. It does not represent connected
production billing, hosted Supabase, native store builds, or real consumer data.

## Live verification

- The first direct static upload was rejected as release evidence after a real browser exposed six
  missing generated font/favicon requests. The deployment was rebuilt from repository source on
  Vercel so Expo's nested generated assets were retained.
- The production alias then loaded the seeded chat list and direct
  `/space/space-maya-jamie?demoDate=2026-12-05` route with zero browser console errors or warnings.
- The live **Remember this → Moment → Keep this Moment** journey completed and the new Moment
  appeared in the relationship timeline.
- Viewports 390×844 and 1180×820 were visually reviewed; the mobile conversation and wide
  conversation/relationship split rendered without clipping or missing assets.
- Deployment inputs were checked with `vercel deploy --dry`; `.env*`, local Supabase state,
  `.superpowers`, browser traces, test output, and generated local bundles are excluded by
  `.vercelignore`.

Screenshots are retained locally under `output/playwright/screenshots/` and remain intentionally
untracked so Devpost assets can be selected and edited without committing generated evidence.
