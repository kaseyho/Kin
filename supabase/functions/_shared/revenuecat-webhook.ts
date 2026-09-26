import { secureSecretEqual } from "./cron-secret.ts";

const entitlementId = "kin_plus";
const signatureToleranceSeconds = 300;
const blockedUserIds = new Set(["00000000-0000-0000-0000-000000000000"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const eventIdPattern = /^[A-Za-z0-9_:-]{1,255}$/;
const eventTypePattern = /^[A-Z][A-Z0-9_]{1,79}$/;
const knownStores = new Set([
  "amazon",
  "app_store",
  "mac_app_store",
  "paddle",
  "play_store",
  "promotional",
  "rc_billing",
  "roku",
  "stripe",
  "test_store",
]);

export interface RevenueCatProjection {
  entitlementId: "kin_plus";
  environment: "production" | "sandbox";
  eventCreatedAt: string;
  eventId: string;
  eventType: string;
  expiresAt: string | null;
  isActive: boolean;
  productId: string | null;
  store: string;
  userId: string;
}

export interface RevenueCatWebhookLog {
  correlationId: string;
  environment?: "production" | "sandbox";
  eventId?: string;
  eventType?: string;
  outcome:
    | "configuration_failed"
    | "database_failed"
    | "duplicate"
    | "processed"
    | "provider_failed"
    | "rejected";
}

interface RevenueCatWebhookDependencies {
  configuredAuthorization: () => string | undefined;
  createCorrelationId: () => string;
  fetch: typeof fetch;
  log: (entry: RevenueCatWebhookLog) => void;
  now: () => Date;
  secretApiKey: () => string | undefined;
  signingSecret: () => string | undefined;
  syncProjection: (projection: RevenueCatProjection) => Promise<boolean>;
}

interface ParsedEvent {
  environment: "production" | "sandbox";
  eventCreatedAt: string;
  id: string;
  lookupId: string;
  store: string;
  type: string;
  userId: string;
}

interface SubscriberProjection {
  environment: "production" | "sandbox";
  expiresAt: string | null;
  isActive: boolean;
  productId: string | null;
  store: string;
}

class InvalidEventError extends Error {}
class ProviderError extends Error {}

export function createRevenueCatWebhookHandler(
  dependencies: RevenueCatWebhookDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const correlationId = dependencies.createCorrelationId();
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const configuredAuthorization = dependencies.configuredAuthorization();
    const signingSecret = dependencies.signingSecret();
    const secretApiKey = dependencies.secretApiKey();
    if (!configuredAuthorization || !signingSecret || !secretApiKey) {
      dependencies.log({ correlationId, outcome: "configuration_failed" });
      return json({ error: "webhook_not_configured" }, 500);
    }

    if (
      !secureSecretEqual(
        request.headers.get("Authorization"),
        configuredAuthorization,
      )
    ) {
      dependencies.log({ correlationId, outcome: "rejected" });
      return json({ error: "authentication_required" }, 401);
    }

    const signatureHeader = request.headers.get(
      "X-RevenueCat-Webhook-Signature",
    );
    if (!signatureHeader) {
      dependencies.log({ correlationId, outcome: "rejected" });
      return json({ error: "signature_required" }, 401);
    }

    const rawBody = await request.text();
    if (
      !await verifySignature(
        rawBody,
        signatureHeader,
        signingSecret,
        Math.floor(dependencies.now().getTime() / 1_000),
      )
    ) {
      dependencies.log({ correlationId, outcome: "rejected" });
      return json({ error: "signature_invalid" }, 401);
    }

    let event: ParsedEvent;
    try {
      event = parseEvent(rawBody);
    } catch {
      dependencies.log({ correlationId, outcome: "rejected" });
      return json({ error: "event_invalid" }, 400);
    }

    const logBase = {
      correlationId,
      environment: event.environment,
      eventId: event.id,
      eventType: event.type,
    };

    let current: SubscriberProjection;
    try {
      const response = await dependencies.fetch(
        `https://api.revenuecat.com/v1/subscribers/${
          encodeURIComponent(event.lookupId)
        }`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${secretApiKey}`,
          },
          method: "GET",
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) throw new ProviderError("subscriber_lookup_failed");
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ProviderError("subscriber_response_invalid");
      }
      current = mapRevenueCatSubscriber(body, {
        environment: event.environment,
        store: event.store,
      });
    } catch {
      dependencies.log({ ...logBase, outcome: "provider_failed" });
      return json({ error: "subscriber_sync_failed" }, 502);
    }

    try {
      const inserted = await dependencies.syncProjection({
        entitlementId,
        environment: current.environment,
        eventCreatedAt: event.eventCreatedAt,
        eventId: event.id,
        eventType: event.type,
        expiresAt: current.expiresAt,
        isActive: current.isActive,
        productId: current.productId,
        store: current.store,
        userId: event.userId,
      });
      dependencies.log({
        ...logBase,
        outcome: inserted ? "processed" : "duplicate",
      });
      return json({ duplicate: !inserted, ok: true }, 200);
    } catch {
      dependencies.log({ ...logBase, outcome: "database_failed" });
      return json({ error: "projection_sync_failed" }, 503);
    }
  };
}

export function mapRevenueCatSubscriber(
  value: unknown,
  fallback: { environment: "production" | "sandbox"; store: string },
): SubscriberProjection {
  const root = record(value);
  const requestDate = dateFrom(
    Number.isSafeInteger(root.request_date_ms)
      ? root.request_date_ms
      : root.request_date,
    "request_date",
  );
  const subscriber = record(root.subscriber);
  const entitlements = record(subscriber.entitlements);
  const entitlement = entitlements[entitlementId];
  if (entitlement === undefined || entitlement === null) {
    return {
      environment: fallback.environment,
      expiresAt: null,
      isActive: false,
      productId: null,
      store: normalizeStore(fallback.store),
    };
  }

  const details = record(entitlement);
  const productId = boundedString(
    details.product_identifier,
    "product_identifier",
    255,
  );
  const expires = nullableDate(details.expires_date, "expires_date");
  const grace = nullableDate(
    details.grace_period_expires_date,
    "grace_period_expires_date",
  );
  const effectiveExpiry = expires === null
    ? null
    : grace && grace.getTime() > expires.getTime()
    ? grace
    : expires;
  const purchase = purchaseMetadata(subscriber, productId);

  return {
    environment: purchase?.isSandbox === undefined
      ? fallback.environment
      : purchase.isSandbox
      ? "sandbox"
      : "production",
    expiresAt: effectiveExpiry?.toISOString() ?? null,
    isActive: effectiveExpiry === null ||
      effectiveExpiry.getTime() > requestDate.getTime(),
    productId,
    store: purchase?.store ?? normalizeStore(fallback.store),
  };
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  const leftBytes = decodeHex(left);
  const rightBytes = decodeHex(right);
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
  nowSeconds: number,
): Promise<boolean> {
  const fields = new Map<string, string>();
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) return false;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || !value || fields.has(key)) return false;
    fields.set(key, value);
  }
  if (fields.size !== 2) return false;
  const timestamp = fields.get("t");
  const providedSignature = fields.get("v1");
  if (
    !timestamp || !providedSignature || !/^\d{1,15}$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/i.test(providedSignature)
  ) {
    return false;
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  const computedSignature = Array.from(
    new Uint8Array(signed),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (!constantTimeHexEqual(computedSignature, providedSignature)) return false;
  return Math.abs(nowSeconds - timestampSeconds) <= signatureToleranceSeconds;
}

function parseEvent(rawBody: string): ParsedEvent {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new InvalidEventError("json_invalid");
  }
  const root = record(value);
  if (root.api_version !== "1.0") {
    throw new InvalidEventError("api_version_invalid");
  }
  const event = record(root.event);
  const id = boundedString(event.id, "event_id", 255);
  if (!eventIdPattern.test(id)) throw new InvalidEventError("event_id_invalid");
  const type = boundedString(event.type, "event_type", 80);
  if (!eventTypePattern.test(type)) {
    throw new InvalidEventError("event_type_invalid");
  }
  const lookupId = boundedString(event.app_user_id, "app_user_id", 1024);
  const originalId = optionalString(
    event.original_app_user_id,
    "original_app_user_id",
    1024,
  );
  const aliases = stringArray(event.aliases, "aliases", 1_000, 1024);
  const userId = resolveUserId([lookupId, originalId, ...aliases]);
  const environment = normalizeEnvironment(event.environment);
  const store = normalizeStore(optionalString(event.store, "store", 80));
  if (
    !Number.isSafeInteger(event.event_timestamp_ms) ||
    Number(event.event_timestamp_ms) <= 0
  ) {
    throw new InvalidEventError("event_timestamp_invalid");
  }
  const eventCreatedAt = dateFrom(event.event_timestamp_ms, "event_timestamp")
    .toISOString();
  return { environment, eventCreatedAt, id, lookupId, store, type, userId };
}

function resolveUserId(ids: string[]): string {
  const candidates = new Set(
    ids.filter((value) => uuidPattern.test(value)).map((value) =>
      value.toLowerCase()
    )
      .filter((value) => !blockedUserIds.has(value)),
  );
  if (candidates.size !== 1) throw new InvalidEventError("identity_ambiguous");
  return [...candidates][0];
}

function purchaseMetadata(
  subscriber: Record<string, unknown>,
  productId: string,
): { isSandbox?: boolean; store: string } | null {
  const subscriptions = optionalRecord(subscriber.subscriptions);
  const subscription = subscriptions?.[productId];
  if (subscription !== undefined && subscription !== null) {
    const details = record(subscription);
    return {
      isSandbox: optionalBoolean(details.is_sandbox, "is_sandbox"),
      store: normalizeStore(optionalString(details.store, "store", 80)),
    };
  }

  const nonSubscriptions = optionalRecord(subscriber.non_subscriptions);
  const purchases = nonSubscriptions?.[productId];
  if (!Array.isArray(purchases) || purchases.length === 0) return null;
  const sorted = purchases.map((entry) => record(entry)).sort((left, right) => {
    return sortableDate(right.purchase_date) - sortableDate(left.purchase_date);
  });
  return {
    isSandbox: optionalBoolean(sorted[0].is_sandbox, "is_sandbox"),
    store: normalizeStore(optionalString(sorted[0].store, "store", 80)),
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidEventError("object_required");
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  return record(value);
}

function boundedString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new InvalidEventError(`${field}_required`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new InvalidEventError(`${field}_invalid`);
  }
  return normalized;
}

function optionalString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > maximum) {
    throw new InvalidEventError(`${field}_invalid`);
  }
  return value.trim();
}

function stringArray(
  value: unknown,
  field: string,
  maximumItems: number,
  maximumLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new InvalidEventError(`${field}_invalid`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.length > maximumLength) {
      throw new InvalidEventError(`${field}_invalid`);
    }
    return item.trim();
  });
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new InvalidEventError(`${field}_invalid`);
  }
  return value;
}

function normalizeEnvironment(value: unknown): "production" | "sandbox" {
  if (typeof value !== "string") {
    throw new InvalidEventError("environment_required");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized !== "production" && normalized !== "sandbox") {
    throw new InvalidEventError("environment_invalid");
  }
  return normalized;
}

function normalizeStore(value: string): string {
  const normalized = value.trim().toLowerCase();
  return knownStores.has(normalized) ? normalized : "unknown";
}

function dateFrom(value: unknown, field: string): Date {
  const date = typeof value === "number"
    ? new Date(value)
    : new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new InvalidEventError(`${field}_invalid`);
  }
  return date;
}

function nullableDate(value: unknown, field: string): Date | null {
  if (value === null) return null;
  if (value === undefined) throw new InvalidEventError(`${field}_required`);
  return dateFrom(value, field);
}

function sortableDate(value: unknown): number {
  if (typeof value !== "string") return Number.NEGATIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function decodeHex(value: string): Uint8Array | null {
  if (
    value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)
  ) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
