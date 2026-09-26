import { adminClient } from "../_shared/http.ts";
import {
  createRevenueCatWebhookHandler,
  type RevenueCatProjection,
  type RevenueCatWebhookLog,
} from "../_shared/revenuecat-webhook.ts";

const handler = createRevenueCatWebhookHandler({
  configuredAuthorization: () =>
    Deno.env.get("REVENUECAT_WEBHOOK_AUTHORIZATION"),
  createCorrelationId: () => crypto.randomUUID(),
  fetch,
  log: writeLog,
  now: () => new Date(),
  secretApiKey: () => Deno.env.get("REVENUECAT_SECRET_API_KEY"),
  signingSecret: () => Deno.env.get("REVENUECAT_WEBHOOK_SIGNING_SECRET"),
  syncProjection,
});

Deno.serve(handler);

async function syncProjection(
  projection: RevenueCatProjection,
): Promise<boolean> {
  const result = await adminClient().rpc("sync_revenuecat_entitlement", {
    target_entitlement_id: projection.entitlementId,
    target_environment: projection.environment,
    target_event_created_at: projection.eventCreatedAt,
    target_event_id: projection.eventId,
    target_event_type: projection.eventType,
    target_expires_at: projection.expiresAt,
    target_is_active: projection.isActive,
    target_product_id: projection.productId,
    target_store: projection.store,
    target_user_id: projection.userId,
  });
  if (result.error || typeof result.data !== "boolean") {
    throw new Error("projection_sync_failed");
  }
  return result.data;
}

function writeLog(entry: RevenueCatWebhookLog): void {
  const serialized = JSON.stringify(entry);
  if (entry.outcome === "processed" || entry.outcome === "duplicate") {
    console.log(serialized);
  } else console.error(serialized);
}
