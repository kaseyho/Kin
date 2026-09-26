import {
  constantTimeHexEqual,
  createRevenueCatWebhookHandler,
  mapRevenueCatSubscriber,
  type RevenueCatProjection,
  type RevenueCatWebhookLog,
} from "./revenuecat-webhook.ts";

const authorization = "Bearer webhook-secret-0123456789";
const signingSecret = "whsec_signing_secret_0123456789";
const apiKey = "sk_revenuecat_secret_0123456789";
const now = new Date("2026-09-27T12:00:00.000Z");
const userId = "16000000-0000-0000-0000-000000000001";
const otherUserId = "16000000-0000-0000-0000-000000000002";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    api_version: "1.0",
    event: {
      aliases: [userId],
      app_user_id: userId,
      environment: "PRODUCTION",
      event_timestamp_ms: now.getTime() - 1_000,
      id: "evt_123",
      original_app_user_id: userId,
      store: "APP_STORE",
      type: "RENEWAL",
      ...overrides,
    },
  });
}

function subscriber(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    request_date: now.toISOString(),
    request_date_ms: now.getTime(),
    subscriber: {
      entitlements: {
        kin_plus: {
          expires_date: "2026-10-27T12:00:00.000Z",
          grace_period_expires_date: null,
          product_identifier: "kin_plus_monthly",
          purchase_date: "2026-09-27T12:00:00.000Z",
        },
      },
      non_subscriptions: {},
      subscriptions: {
        kin_plus_monthly: {
          expires_date: "2026-10-27T12:00:00.000Z",
          grace_period_expires_date: null,
          is_sandbox: false,
          store: "app_store",
        },
      },
      ...overrides,
    },
  };
}

async function signature(
  body: string,
  timestamp = Math.floor(now.getTime() / 1_000),
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const value = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return `t=${timestamp},v1=${
    Array.from(new Uint8Array(value), (byte) =>
      byte.toString(16).padStart(2, "0")).join("")
  }`;
}

async function request(
  body: string,
  signatureHeader?: string,
  auth = authorization,
): Promise<Request> {
  return new Request("http://localhost/functions/v1/revenuecat-webhook", {
    body,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      ...(signatureHeader
        ? { "X-RevenueCat-Webhook-Signature": signatureHeader }
        : {}),
    },
    method: "POST",
  });
}

function handler(overrides: {
  fetch?: typeof fetch;
  logs?: RevenueCatWebhookLog[];
  projections?: RevenueCatProjection[];
  syncProjection?: (projection: RevenueCatProjection) => Promise<boolean>;
} = {}) {
  const logs = overrides.logs ?? [];
  const projections = overrides.projections ?? [];
  return createRevenueCatWebhookHandler({
    configuredAuthorization: () => authorization,
    createCorrelationId: () => "corr-safe-123",
    fetch: overrides.fetch ?? (async () => Response.json(subscriber())),
    log: (entry) => logs.push(entry),
    now: () => now,
    secretApiKey: () => apiKey,
    signingSecret: () => signingSecret,
    syncProjection: overrides.syncProjection ?? (async (projection) => {
      projections.push(projection);
      return true;
    }),
  });
}

Deno.test("RevenueCat webhook rejects auth and signature failures before parsing or outbound work", async () => {
  const originalBody = payload();
  const validSignature = await signature(originalBody);
  const past = Math.floor(now.getTime() / 1_000) - 301;
  const future = Math.floor(now.getTime() / 1_000) + 301;
  const attempts = [
    await request("{not json", validSignature, ""),
    await request("{not json", validSignature, "Bearer wrong"),
    await request("{not json"),
    await request("{not json", "t=bad,v1=missing"),
    await request(
      "{not json",
      `t=${Math.floor(now.getTime() / 1_000)},v1=${"z".repeat(64)}`,
    ),
    await request(originalBody, await signature(originalBody, past)),
    await request(originalBody, await signature(originalBody, future)),
    await request(`${originalBody} `, validSignature),
  ];
  let fetchCalls = 0;
  let syncCalls = 0;
  const handle = handler({
    fetch: async () => {
      fetchCalls += 1;
      return Response.json(subscriber());
    },
    syncProjection: async () => {
      syncCalls += 1;
      return true;
    },
  });

  for (const attempt of attempts) {
    const response = await handle(attempt);
    assert(
      response.status === 401,
      `security failure should return 401, received ${response.status}`,
    );
  }
  assert(fetchCalls === 0, "unverified bodies cannot reach RevenueCat");
  assert(syncCalls === 0, "unverified bodies cannot reach the database");
});

Deno.test("HMAC comparison validates equal-length hex without accepting malformed input", () => {
  assert(constantTimeHexEqual("00ff", "00ff"), "equal hex should match");
  assert(!constantTimeHexEqual("00ff", "00fe"), "a changed byte should fail");
  assert(!constantTimeHexEqual("00ff", "00"), "a changed length should fail");
  assert(!constantTimeHexEqual("00ff", "zzzz"), "non-hex input should fail");
});

Deno.test("RevenueCat webhook rejects malformed and ambiguous identities before subscriber lookup", async () => {
  const bodies = [
    '{"api_version":"1.0","event":',
    payload({ id: "" }),
    payload({ app_user_id: "" }),
    payload({ type: "renewal" }),
    payload({
      aliases: ["$RCAnonymousID:blocked"],
      app_user_id: "$RCAnonymousID:blocked",
      original_app_user_id: "legacy-user",
    }),
    payload({
      aliases: ["00000000-0000-0000-0000-000000000000"],
      app_user_id: "00000000-0000-0000-0000-000000000000",
      original_app_user_id: "00000000-0000-0000-0000-000000000000",
    }),
    payload({ aliases: [userId, otherUserId] }),
  ];
  let fetchCalls = 0;
  const handle = handler({
    fetch: async () => {
      fetchCalls += 1;
      return Response.json(subscriber());
    },
  });

  for (const body of bodies) {
    const response = await handle(await request(body, await signature(body)));
    assert(
      response.status === 400,
      `malformed event should return 400, received ${response.status}`,
    );
  }
  assert(
    fetchCalls === 0,
    "invalid identities cannot trigger provider lookups",
  );
});

Deno.test("RevenueCat webhook URL-encodes the lookup ID and syncs the sole Supabase UUID", async () => {
  const anonymousId = "$RCAnonymousID:abc/with space";
  const body = payload({
    aliases: [anonymousId, userId],
    app_user_id: anonymousId,
    original_app_user_id: anonymousId,
  });
  const projections: RevenueCatProjection[] = [];
  let seenUrl = "";
  let seenAuthorization = "";
  const handle = handler({
    fetch: async (input, init) => {
      seenUrl = String(input);
      seenAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
      return Response.json(subscriber());
    },
    projections,
  });

  const response = await handle(await request(body, await signature(body)));

  assert(response.status === 200, "valid event should be acknowledged");
  assert(
    seenUrl.endsWith(encodeURIComponent(anonymousId)),
    "lookup ID must be URL encoded",
  );
  assert(
    seenAuthorization === `Bearer ${apiKey}`,
    "only the server API key should authorize lookup",
  );
  assert(projections.length === 1, "one database transaction should run");
  assert(
    projections[0].userId === userId,
    "the sole UUID alias should own the projection",
  );
  assert(projections[0].isActive, "current subscriber state should grant Kin+");
});

Deno.test("subscriber mapping handles active, expired, lifetime, grace, missing, and environment state", () => {
  const baseEvent = { environment: "production" as const, store: "app_store" };
  const active = mapRevenueCatSubscriber(subscriber(), baseEvent);
  const expired = mapRevenueCatSubscriber(
    subscriber({
      entitlements: {
        kin_plus: {
          expires_date: "2026-09-26T12:00:00.000Z",
          grace_period_expires_date: null,
          product_identifier: "kin_plus_monthly",
        },
      },
    }),
    baseEvent,
  );
  const lifetime = mapRevenueCatSubscriber(
    subscriber({
      entitlements: {
        kin_plus: {
          expires_date: null,
          grace_period_expires_date: null,
          product_identifier: "kin_plus_lifetime",
        },
      },
      non_subscriptions: {
        kin_plus_lifetime: [{
          is_sandbox: true,
          purchase_date: now.toISOString(),
          store: "test_store",
        }],
      },
      subscriptions: {},
    }),
    baseEvent,
  );
  const grace = mapRevenueCatSubscriber(
    subscriber({
      entitlements: {
        kin_plus: {
          expires_date: "2026-09-26T12:00:00.000Z",
          grace_period_expires_date: "2026-09-29T12:00:00.000Z",
          product_identifier: "kin_plus_monthly",
        },
      },
    }),
    baseEvent,
  );
  const missing = mapRevenueCatSubscriber(
    subscriber({ entitlements: {}, subscriptions: {} }),
    {
      environment: "sandbox",
      store: "play_store",
    },
  );

  assert(
    active.isActive && active.environment === "production",
    "future production access should be active",
  );
  assert(!expired.isActive, "past access should be inactive");
  assert(
    lifetime.isActive && lifetime.expiresAt === null,
    "lifetime access should have no expiry",
  );
  assert(
    lifetime.environment === "sandbox" && lifetime.store === "test_store",
    "purchase metadata should win",
  );
  assert(
    grace.isActive && grace.expiresAt === "2026-09-29T12:00:00.000Z",
    "grace expiry should extend access",
  );
  assert(
    !missing.isActive && missing.productId === null,
    "missing Kin+ should revoke the projection",
  );
  assert(
    missing.environment === "sandbox" && missing.store === "play_store",
    "event metadata should safely backfill missing access",
  );
});

Deno.test("event type never decides access and duplicate deliveries stay successful", async () => {
  const body = payload({ type: "INITIAL_PURCHASE" });
  const projections: RevenueCatProjection[] = [];
  const handle = handler({
    fetch: async () =>
      Response.json(subscriber({ entitlements: {}, subscriptions: {} })),
    syncProjection: async (projection) => {
      projections.push(projection);
      return false;
    },
  });

  const response = await handle(await request(body, await signature(body)));
  const result = await response.json();

  assert(response.status === 200, "duplicate events should be acknowledged");
  assert(result.duplicate === true, "duplicate result should be explicit");
  assert(
    projections.length === 1 && !projections[0].isActive,
    "subscriber state should override purchase event wording",
  );
});

Deno.test("provider and database failures remain retryable and are never acknowledged as processed", async () => {
  const body = payload();
  const signed = await signature(body);
  let syncCalls = 0;
  const providerFailure = handler({
    fetch: async () =>
      new Response("provider detail must stay private", { status: 503 }),
    syncProjection: async () => {
      syncCalls += 1;
      return true;
    },
  });
  const databaseFailure = handler({
    syncProjection: async () => {
      throw new Error("database detail must stay private");
    },
  });

  const providerResponse = await providerFailure(await request(body, signed));
  const databaseResponse = await databaseFailure(await request(body, signed));

  assert(
    providerResponse.status === 502,
    "provider failure should trigger a retry",
  );
  assert(
    databaseResponse.status === 503,
    "database failure should trigger a retry",
  );
  assert(syncCalls === 0, "provider failure cannot mark an event processed");
});

Deno.test("webhook logs contain only coarse allowlisted operational fields", async () => {
  const logs: RevenueCatWebhookLog[] = [];
  const sensitiveBody = payload({
    product_id: "private-product-receipt",
    subscriber_attributes: { email: { value: "private@example.com" } },
  });
  const handle = handler({ logs });

  const response = await handle(
    await request(sensitiveBody, await signature(sensitiveBody)),
  );
  assert(response.status === 200, "valid event should complete");
  assert(logs.length === 1, "one completion log should be emitted");
  assert(
    Object.keys(logs[0]).sort().join(",") ===
      "correlationId,environment,eventId,eventType,outcome",
    "logs must use the exact allowlist",
  );
  const serialized = JSON.stringify(logs);
  for (
    const secret of [
      authorization,
      signingSecret,
      apiKey,
      "private@example.com",
      "private-product-receipt",
    ]
  ) {
    assert(!serialized.includes(secret), `logs must redact ${secret}`);
  }
});
