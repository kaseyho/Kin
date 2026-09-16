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
  preferences, invitations, and owned media. A Kin Space with another member transfers ownership
  to that member; an empty Space is deleted. The client signs out only after the function returns
  `{ "deleted": true }`.

## Required server configuration

The Edge runtime supplies these built-in secrets for a linked Supabase project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never place the service-role key in `.env`, EAS `EXPO_PUBLIC_` variables, client logs, screenshots,
or Devpost materials. Configure production SMTP in Supabase Auth before enabling consumer signup.
Keep anonymous sign-in disabled.

## Deploy

From the repository root, after `supabase login` and `supabase link --project-ref <project-ref>`:

```bash
npx supabase db push
npx supabase functions deploy export-account --no-verify-jwt
npx supabase functions deploy delete-account --no-verify-jwt
```

`--no-verify-jwt` is intentional: each handler calls Supabase Auth `getUser` with the supplied bearer
token and returns Kin-owned error codes. Do not remove that in-handler validation.

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

Do not call this production-verified until all seven checks pass against the hosted project.

## Partial-failure recovery

Deletion crosses Storage, public tables, and Auth, so it cannot be one transaction across all
providers. The function removes owned storage first, prepares Space ownership in one database
transaction, then deletes the Auth user.

- If Storage cleanup fails, database/Auth deletion does not start. The consumer may safely retry.
- If ownership preparation fails, Auth deletion does not start. Inspect the operation ID in the
  function log and retry after repairing the database issue.
- If Auth Admin deletion fails after preparation, the account still exists but some owned media may
  already be gone and Space ownership may have transferred. Record the operation ID, disable access
  if necessary, rerun deletion from an authenticated fresh session, and verify every hosted check.
- If the client reports that the account was deleted but local sign-out failed, ask the user to
  close and reopen Kin; the server identity is already gone.

Function logs intentionally include only the operation ID, user UUID, and coarse status. Do not add
message bodies, email addresses, tokens, storage paths, provider errors, or exported data to logs.

## Support response

When a user reports a failed export or deletion, request only the approximate time, platform, and
operation ID shown by support tooling. Never ask for an OTP, access token, exported JSON, or private
conversation content. Confirm completion by server records and storage prefixes, then tell the user
what was removed and whether any manual cleanup remains.

## Current external gate

The handlers type-check without credentials. Runtime proof requires a running local Supabase stack
or a linked hosted development project. Docker is not available in the current workspace and no
hosted project credentials are configured, so SMTP delivery, transactional cleanup, Storage
removal, and Auth Admin deletion remain external deployment gates.
