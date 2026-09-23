import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';

import { createExpoPushTransport } from '../_shared/expo-push.ts';
import { adminClient } from '../_shared/http.ts';
import { createMessageNotificationHandler } from '../_shared/message-notification-handler.ts';
import {
  type ClaimedNotificationJob,
  type NotificationPayload,
  type NotificationWorkerDependencies,
  runMessageNotificationWorker,
  type TicketedNotification,
} from '../_shared/message-notifications.ts';

type ClaimedRow = {
  attempts: number;
  id: string;
  installation_id: string;
  message_id: string;
  processing_token: string;
  recipient_id: string;
  space_id: string;
};

type PayloadRow = {
  expo_push_token: string;
  installation_id: string;
  message_body: string;
  message_kind: NotificationPayload['kind'];
  previews_enabled: boolean;
  sender_name: string;
  space_id: string;
};

type TicketedRow = {
  attempts: number;
  expo_ticket_id: string;
  id: string;
  installation_id: string;
  receipt_attempts: number;
  receipt_processing_token: string;
  ticketed_at: string;
};

const handler = createMessageNotificationHandler({
  configuredSecret: () => Deno.env.get('KIN_NOTIFICATION_CRON_SECRET'),
  runWorker: async () => {
    const admin = adminClient();
    const transport = createExpoPushTransport({
      accessToken: Deno.env.get('EXPO_ACCESS_TOKEN'),
      fetch,
    });
    return runMessageNotificationWorker(dependencies(admin, transport));
  },
});

Deno.serve(async (request) => {
  const response = await handler(request);
  const log = JSON.stringify({
    httpStatus: response.status,
    status: response.status >= 500
      ? 'notification_worker_incomplete'
      : response.status >= 400 ? 'notification_worker_rejected' : 'notification_worker_complete',
  });
  if (response.status >= 400) console.error(log);
  else console.log(log);
  return response;
});

function dependencies(
  admin: SupabaseClient,
  transport: ReturnType<typeof createExpoPushTransport>,
): NotificationWorkerDependencies {
  return {
    async claimJobs(maximumJobs) {
      const result = await admin.rpc('claim_message_notification_jobs', {
        maximum_jobs: maximumJobs,
      });
      assertResult(result.error, 'notification_claim_failed');
      return ((result.data ?? []) as ClaimedRow[]).map(mapClaimedJob);
    },

    async claimReceipts(maximumReceipts) {
      const result = await admin.rpc('claim_message_notification_receipts', {
        maximum_receipts: maximumReceipts,
      });
      assertResult(result.error, 'notification_receipt_claim_failed');
      return ((result.data ?? []) as TicketedRow[]).map((row): TicketedNotification => ({
        attempts: row.attempts,
        id: row.id,
        installationId: row.installation_id,
        receiptAttempts: row.receipt_attempts,
        receiptProcessingToken: row.receipt_processing_token,
        ticketId: row.expo_ticket_id,
        ticketedAt: row.ticketed_at,
      }));
    },

    async completeJob(job, ticketId) {
      const result = await admin.rpc('complete_message_notification_job', {
        target_expo_ticket_id: ticketId,
        target_job_id: job.id,
        target_processing_token: job.processingToken,
      });
      assertMutation(result.error, result.data, 'notification_ticket_update_failed');
    },

    async completeReceipt(notification, delivered, errorCode) {
      const result = await admin.rpc('complete_message_notification_receipt', {
        target_delivered: delivered,
        target_error_code: errorCode,
        target_expo_ticket_id: notification.ticketId,
        target_job_id: notification.id,
        target_receipt_processing_token: notification.receiptProcessingToken,
      });
      assertMutation(result.error, result.data, 'notification_receipt_update_failed');
    },

    async deactivateInstallation(installationId) {
      const result = await admin
        .from('push_installations')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', installationId);
      assertResult(result.error, 'notification_installation_update_failed');
    },

    async deferReceipt(notification, errorCode, nextAttemptAt) {
      const result = await admin.rpc('defer_message_notification_receipt', {
        target_error_code: errorCode,
        target_expo_ticket_id: notification.ticketId,
        target_job_id: notification.id,
        target_next_attempt_at: nextAttemptAt,
        target_receipt_processing_token: notification.receiptProcessingToken,
      });
      assertMutation(result.error, result.data, 'notification_receipt_defer_failed');
    },

    async failJob(job, errorCode, nextAttemptAt) {
      const result = await admin.rpc('fail_message_notification_job', {
        target_error_code: errorCode,
        target_job_id: job.id,
        target_next_attempt_at: nextAttemptAt,
        target_processing_token: job.processingToken,
      });
      assertMutation(result.error, result.data, 'notification_failure_update_failed');
    },

    getReceipts: transport.getReceipts,

    async heartbeat(input) {
      const result = await admin.rpc('record_message_notification_heartbeat', {
        target_claimed: input.claimed,
        target_failed: input.failed,
        target_status: input.phase,
      });
      assertMutation(result.error, result.data, 'notification_heartbeat_update_failed');
    },

    async loadPayload(job) {
      const result = await admin.rpc('get_message_notification_payload', {
        target_job_id: job.id,
        target_processing_token: job.processingToken,
      });
      assertResult(result.error, 'notification_payload_failed');
      const row = (result.data as PayloadRow[] | null)?.[0];
      return row ? {
        body: row.message_body,
        expoPushToken: row.expo_push_token,
        installationId: row.installation_id,
        kind: row.message_kind,
        previewsEnabled: row.previews_enabled,
        senderName: row.sender_name,
        spaceId: row.space_id,
      } : null;
    },

    now: () => new Date(),

    async retryReceiptDelivery(notification, errorCode, nextAttemptAt) {
      const result = await admin.rpc('retry_message_notification_receipt', {
        target_error_code: errorCode,
        target_expo_ticket_id: notification.ticketId,
        target_job_id: notification.id,
        target_next_attempt_at: nextAttemptAt,
        target_receipt_processing_token: notification.receiptProcessingToken,
      });
      assertMutation(result.error, result.data, 'notification_receipt_retry_failed');
    },

    sendPush: transport.sendPush,
  };
}

function mapClaimedJob(row: ClaimedRow): ClaimedNotificationJob {
  return {
    attempts: row.attempts,
    id: row.id,
    installationId: row.installation_id,
    messageId: row.message_id,
    processingToken: row.processing_token,
    recipientId: row.recipient_id,
    spaceId: row.space_id,
  };
}

function assertResult(error: unknown, code: string): void {
  if (error) throw new Error(code);
}

function assertMutation(error: unknown, data: unknown, code: string): void {
  if (error || data !== true) throw new Error(code);
}
