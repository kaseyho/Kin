# Kin billing and entitlement runbook

This runbook is the operator contract for RevenueCat webhook authentication, the private Supabase
Kin+ entitlement projection, retries, reconciliation, and release evidence. Public RevenueCat SDK
keys belong in the client configuration; the webhook authorization value, HMAC signing secret, v1
secret API key, and Supabase service-role key are server-only. Never put them in `EXPO_PUBLIC_*`,
logs, screenshots, tickets, demo videos, or Devpost material.

The webhook does not grant or revoke access from an event type. It authenticates the exact raw
request body, resolves exactly one Supabase UUID from the RevenueCat identity aliases, fetches the
current `GET /v1/subscribers/{app_user_id}` state with the server API key, and atomically records the
event plus the current `kin_plus` projection. Duplicate event IDs are successful no-ops. RevenueCat
retries every provider or database failure because the function returns non-2xx until the database
transaction commits.

## Credential-free verification

Use Node 22 and run the Deno, database, and application gates:

```bash
nvm use 22
npm run typecheck:functions
npm run test:functions
npm run test:database
npm run typecheck
npm run lint
npm test
```

The Deno suite proves exact authorization, raw-body HMAC verification, five-minute replay
tolerance, changed-body rejection, UUID ambiguity rejection, URL-safe subscriber lookup, current
state mapping for active, expired, lifetime, grace-period, missing, sandbox, and production access,
idempotency, retryable failures, and log redaction. The database gate proves private table grants,
the atomic projection transaction, duplicate event handling, and server-authoritative Moment limits.

## Local signed-request HTTP smoke

This smoke uses valid authorization and HMAC but an intentionally incomplete event. A `400 event_invalid`
response proves the Edge Function accepted the signature and reached schema
validation without making a RevenueCat or database call. A body changed after signing must return
`401 signature_invalid`.

Keep a local Supabase stack running. In the function terminal, generate temporary values and place
them in a mode-600 temporary env file:

```bash
(
  set -e
  billing_env_file=$(mktemp)
  cleanup_billing_smoke() {
    unset REVENUECAT_WEBHOOK_AUTHORIZATION REVENUECAT_WEBHOOK_SIGNING_SECRET
    rm -f "$billing_env_file"
  }
  trap cleanup_billing_smoke EXIT INT TERM
  chmod 600 "$billing_env_file"
  export REVENUECAT_WEBHOOK_AUTHORIZATION='Bearer local-smoke-authorization-0123456789'
  export REVENUECAT_WEBHOOK_SIGNING_SECRET='local-smoke-signing-secret-0123456789'
  printf '%s\n' \
    "REVENUECAT_WEBHOOK_AUTHORIZATION=$REVENUECAT_WEBHOOK_AUTHORIZATION" \
    "REVENUECAT_WEBHOOK_SIGNING_SECRET=$REVENUECAT_WEBHOOK_SIGNING_SECRET" \
    'REVENUECAT_SECRET_API_KEY=sk_local_http_smoke_not_used' > "$billing_env_file"
  npx supabase functions serve revenuecat-webhook --no-verify-jwt --env-file "$billing_env_file"
)
```

Use the same harmless local-only values in the request terminal, then sign the exact body bytes
with Deno Web Crypto and call the function:

```bash
export REVENUECAT_WEBHOOK_AUTHORIZATION='Bearer local-smoke-authorization-0123456789'
export REVENUECAT_WEBHOOK_SIGNING_SECRET='local-smoke-signing-secret-0123456789'
billing_timestamp=$(date +%s)
billing_body='{}'
export billing_timestamp billing_body
billing_signature=$(npx --yes deno@2.9.6 eval '
  const e = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", e.encode(Deno.env.get("REVENUECAT_WEBHOOK_SIGNING_SECRET")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const bytes = await crypto.subtle.sign(
    "HMAC", key, e.encode(`${Deno.env.get("billing_timestamp")}.${Deno.env.get("billing_body")}`)
  );
  console.log(Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join(""));
')
curl --silent --show-error --write-out '\nHTTP %{http_code}\n' \
  --request POST \
  --header "Authorization: $REVENUECAT_WEBHOOK_AUTHORIZATION" \
  --header "X-RevenueCat-Webhook-Signature: t=$billing_timestamp,v1=$billing_signature" \
  --header 'Content-Type: application/json' \
  --data-binary "$billing_body" \
  http://127.0.0.1:54321/functions/v1/revenuecat-webhook
```

Expected: `{"error":"event_invalid"}` and HTTP `400`. Repeat with
`--data-binary "$billing_body "` while retaining the original signature; expected HTTP `401`.
Unset the request-terminal values and stop the function with Ctrl-C:

```bash
unset REVENUECAT_WEBHOOK_AUTHORIZATION REVENUECAT_WEBHOOK_SIGNING_SECRET
unset billing_timestamp billing_body billing_signature
```

## RevenueCat dashboard and Supabase setup

Create two RevenueCat webhook integrations rather than mixing environments:

1. **Kin staging** — staging Supabase URL, sandbox events only.
2. **Kin production** — production Supabase URL, production events only.

For each integration, use the corresponding HTTPS endpoint:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/revenuecat-webhook
```

Generate a unique high-entropy authorization value, set it as the dashboard Authorization header,
enable HMAC signing, and copy the one-time signing secret immediately into the password manager.
Use a RevenueCat **v1 secret API key** for `GET /v1/subscribers`; never use a public SDK key here.
Store the three values in the matching Supabase project without echoing them:

```bash
read -rs "REVENUECAT_WEBHOOK_AUTHORIZATION?Webhook authorization value: "
export REVENUECAT_WEBHOOK_AUTHORIZATION
read -rs "REVENUECAT_WEBHOOK_SIGNING_SECRET?Webhook HMAC signing secret: "
export REVENUECAT_WEBHOOK_SIGNING_SECRET
read -rs "REVENUECAT_SECRET_API_KEY?RevenueCat v1 secret API key: "
export REVENUECAT_SECRET_API_KEY

npx supabase secrets set \
  REVENUECAT_WEBHOOK_AUTHORIZATION="$REVENUECAT_WEBHOOK_AUTHORIZATION" \
  REVENUECAT_WEBHOOK_SIGNING_SECRET="$REVENUECAT_WEBHOOK_SIGNING_SECRET" \
  REVENUECAT_SECRET_API_KEY="$REVENUECAT_SECRET_API_KEY"
npx supabase functions deploy revenuecat-webhook --no-verify-jwt

unset REVENUECAT_WEBHOOK_AUTHORIZATION REVENUECAT_WEBHOOK_SIGNING_SECRET REVENUECAT_SECRET_API_KEY
```

The client App User ID must be the signed-in Supabase UUID. Do not launch with anonymous RevenueCat
IDs as the only identity: the webhook deliberately rejects an alias set without exactly one UUID.
The entitlement identifier must be exactly `kin_plus` in both RevenueCat projects.

## Health checks and redacted evidence

An unsigned POST must return `401`; do not use a real secret for this check:

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --request POST https://YOUR_PROJECT.supabase.co/functions/v1/revenuecat-webhook
```

Complete one sandbox purchase with a staging account whose RevenueCat App User ID is its Supabase
UUID. Confirm a `200` delivery in RevenueCat and inspect only the private coarse projection:

```sql
select user_id, entitlement_id, is_active, expires_at, store, environment,
       last_event_id, last_event_created_at, synced_at
from public.billing_entitlements
where user_id = 'SUPABASE_USER_UUID' and entitlement_id = 'kin_plus';

select event_id, event_type, user_id, environment, provider_created_at, processed_at
from public.revenuecat_webhook_events
where user_id = 'SUPABASE_USER_UUID'
order by processed_at desc
limit 10;
```

Function logs are allowlisted to correlation ID, event ID, coarse event type/environment, and
outcome. Capture those fields plus HTTP status and timestamps as evidence. Never capture the raw
body, Authorization or signature headers, email, subscriber attributes, receipt, product receipt,
or secret API response.

## Retry and reconciliation

RevenueCat automatically retries non-2xx deliveries. After fixing configuration or an outage, use
**Retry** on the failed event in the RevenueCat webhook dashboard; the same event ID makes the
database transaction idempotent. Do not hand-edit `billing_entitlements` and do not invent an
activation from event type.

For a stale projection with no failed delivery, first fetch the current customer state using the v1
secret key and emit only the `kin_plus` fields to the terminal:

```bash
read -rs "REVENUECAT_SECRET_API_KEY?RevenueCat v1 secret API key: "
export REVENUECAT_SECRET_API_KEY
read "REVENUECAT_APP_USER_ID?Supabase UUID / RevenueCat App User ID: "
export REVENUECAT_APP_USER_ID
curl --fail-with-body --silent --show-error \
  --header "Authorization: Bearer $REVENUECAT_SECRET_API_KEY" \
  "https://api.revenuecat.com/v1/subscribers/$REVENUECAT_APP_USER_ID" \
  | jq '{request_date, kin_plus: .subscriber.entitlements.kin_plus}'
unset REVENUECAT_SECRET_API_KEY REVENUECAT_APP_USER_ID
```

Then resend the newest relevant webhook from RevenueCat so the normal authenticated path refreshes
the projection. A direct SQL repair is an emergency-only incident action and must use the existing
`sync_revenuecat_entitlement` transaction with a unique incident event ID, never table writes.

## Secret rotation and incident response

- **Authorization value:** set a new Supabase secret, update the matching RevenueCat integration,
  redeploy, then retry deliveries that landed during the short transition.
- **HMAC signing secret:** RevenueCat invalidates the old value immediately when **Rotate secret**
  is used. Copy the new one once, update the matching Supabase secret, redeploy immediately, and
  retry any transition failures.
- **v1 secret API key:** create/identify the replacement in RevenueCat, update Supabase, redeploy,
  verify one sandbox delivery, then revoke the exposed key.

Never share a staging secret with production. If any server secret appears in a client bundle,
repository, log, screenshot, or submission artifact, treat it as exposed, rotate it, and rerun the
production-bundle verification before release.
