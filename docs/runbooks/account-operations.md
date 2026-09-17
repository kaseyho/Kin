# Kin account export and deletion operations

This runbook covers the privileged account lifecycle implemented by the `export-account` and
`delete-account` Supabase Edge Functions. Both functions validate the caller's bearer token inside
the handler. Deletion additionally requires a token issued in the previous ten minutes, which the
consumer flow obtains by verifying a fresh six-digit email OTP.

## Consumer behavior

- **Export my data** downloads a versioned JSON file on web and opens the platform share sheet on
  native. It contains the caller's profile, memberships, personal Space preferences, authored
  messages, reactions, memories, source links, and invite metadata. Media fields remain durable
  private-storage paths; the export never creates long-lived signed URLs.
- **Delete account** explains the content outcome, emails a fresh OTP without creating a new user,
  verifies six digits, requires the exact text `DELETE`, and then calls the privileged function.
- Deletion removes the user's profile, authored messages, reactions, memories, memberships,
  preferences, invitations, and blocks. A Kin Space with another member transfers ownership to that
  member; an empty Space is deleted. Reports remain pseudonymized for the documented 180-day safety
  retention period and are excluded from export/UI reads. Owned media is durably queued and retried.
  The client signs out only after the function returns `{ "deleted": true }`.

## Required server configuration

The Edge runtime supplies these built-in secrets for a linked Supabase project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The scheduled cleanup function additionally requires a random, server-only
`KIN_CLEANUP_CRON_SECRET`. Store the same value in Supabase Edge Function secrets and Vault as
described in `docs/runbooks/space-safety.md`; it must never be an `EXPO_PUBLIC_` value.

Never place the service-role key in `.env`, EAS `EXPO_PUBLIC_` variables, client logs, screenshots,
or Devpost materials. Configure production SMTP in Supabase Auth before enabling consumer signup.
Keep anonymous sign-in disabled.

## Deploy

From the repository root, after `supabase login` and `supabase link --project-ref <project-ref>`:

```bash
npx supabase db push
npx supabase functions deploy export-account --no-verify-jwt
npx supabase functions deploy delete-account --no-verify-jwt
npx supabase functions deploy process-storage-cleanup --no-verify-jwt
```

`--no-verify-jwt` is intentional: consumer handlers call Supabase Auth `getUser` with the supplied
bearer token, while the scheduled worker compares a dedicated high-entropy secret. Do not remove
either in-handler check.

Before deploying to production, run:

```bash
npm run typecheck:functions
npm run verify:ci
```

## Hosted verification

Use two disposable email accounts that share one Kin Space:

1. Export the first account and verify the JSON contains only that user's owned/authored records.
2. Confirm an expired or older-than-ten-minutes token cannot delete the account.
3. Complete fresh-OTP deletion for the first account.
4. Verify the deleted email can no longer restore a session.
5. Verify the second account can still open the transferred Space and sees only its remaining
   content.
6. Verify `avatars/<deleted-user-id>/` and every
   `chat-media/<space-id>/<deleted-user-id>/` prefix are empty.
7. Verify the Auth user, profile, memberships, preferences, authored messages, reactions, memories,
   and invitations are absent.
8. Verify reports involving the account remain with the deleted identity fields set to `NULL` and a
   future `retention_expires_at`.
9. Verify the deletion operation's Storage cleanup jobs are `completed`.
10. Verify the `kin-storage-cleanup` Cron invocation returns 2xx, then leave an empty Space and
    confirm its queued media is removed without a manual worker run.

Do not call this production-verified until all ten checks pass against the hosted project.

## Partial-failure recovery

Deletion crosses Storage, public tables, and Auth, so it cannot be one transaction across all
providers. The function first discovers account-owned objects through Storage ownership metadata and
records durable `prepared` cleanup jobs. Auth deletion then cascades to the profile; a database
trigger transfers or removes Spaces in that same database transaction. Only after profile absence is
confirmed can cleanup jobs be atomically claimed and Storage objects removed.

- If Storage cleanup fails after Auth deletion, deletion still returns success with
  `cleanupPending: true`. Use `npm run cleanup:storage` from a server-only operator shell; do not ask
  the deleted consumer to sign in again.
- If cleanup-job preparation fails, Auth deletion does not start. Inspect the operation ID, repair the
  database issue, and retry from the still-authenticated account.
- If Auth Admin reports an error and the profile still exists, the function returns
  `auth_deletion_failed`; no Space mutation has occurred and jobs remain safely `prepared`.
- If Auth Admin reports an error but the profile is already absent, the function treats the database
  state as authoritative and finishes cleanup. If the profile lookup itself fails, it returns
  `deletion_state_unknown`; preserve the operation ID and run the retry worker after checking whether
  the profile exists. Prepared jobs are never activated while a live profile exists.
- If the client reports that the account was deleted but local sign-out failed, ask the user to
  close and reopen Kin; the server identity is already gone.

Function logs intentionally include only the operation ID, user UUID, and coarse status. Do not add
message bodies, email addresses, tokens, storage paths, provider errors, or exported data to logs.

## Support response

When a user reports a failed export or deletion, request only the approximate time, platform, and
operation ID shown by support tooling. Never ask for an OTP, access token, exported JSON, or private
conversation content. Confirm completion by server records and storage prefixes, then tell the user
what was removed and whether any manual cleanup remains. Detailed moderation and cleanup commands
are in `docs/runbooks/space-safety.md`.

## Current external gate

The handlers type-check without credentials, and the local Docker pgTAP suite proves database/RLS
cleanup policy. End-to-end SMTP delivery, Storage API removal, and Auth Admin deletion still require
a linked hosted preview project and the controlled-account smoke in `docs/runbooks/space-safety.md`.
