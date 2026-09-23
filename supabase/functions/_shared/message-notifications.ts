export type MessageKind = 'text' | 'image' | 'sticker';

export interface ClaimedNotificationJob {
  attempts: number;
  id: string;
  installationId: string;
  messageId: string;
  processingToken: string;
  recipientId: string;
  spaceId: string;
}

export interface NotificationPayload {
  body: string;
  expoPushToken: string;
  installationId: string;
  kind: MessageKind;
  previewsEnabled: boolean;
  senderName: string;
  spaceId: string;
}

export interface TicketedNotification {
  attempts: number;
  id: string;
  installationId: string;
  receiptAttempts: number;
  receiptProcessingToken: string;
  ticketId: string;
  ticketedAt: string;
}

export interface ExpoPushMessage {
  body: string;
  channelId: 'messages';
  data: { path: string; spaceId: string };
  sound: 'default';
  title: string;
  to: string;
}

export type ExpoPushTicket =
  | { id: string; status: 'ok' }
  | { errorCode: string; status: 'error' };

export type ExpoPushReceipt =
  | { status: 'ok' }
  | { errorCode: string; status: 'error' };

export interface NotificationWorkerSummary {
  claimed: number;
  delivered: number;
  failed: number;
  receiptsChecked: number;
  retried: number;
  ticketed: number;
  incomplete: boolean;
}

export interface NotificationWorkerDependencies {
  claimJobs(maximumJobs: number): Promise<ClaimedNotificationJob[]>;
  claimReceipts(maximumReceipts: number): Promise<TicketedNotification[]>;
  completeJob(job: ClaimedNotificationJob, ticketId: string): Promise<void>;
  completeReceipt(
    notification: TicketedNotification,
    delivered: boolean,
    errorCode: string,
  ): Promise<void>;
  deactivateInstallation(installationId: string): Promise<void>;
  deferReceipt(
    notification: TicketedNotification,
    errorCode: string,
    nextAttemptAt: string,
  ): Promise<void>;
  failJob(
    job: ClaimedNotificationJob,
    errorCode: string,
    nextAttemptAt: string | null,
  ): Promise<void>;
  getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>>;
  heartbeat(input: {
    claimed: number;
    failed: number;
    phase: 'running' | 'succeeded' | 'incomplete';
  }): Promise<void>;
  loadPayload(job: ClaimedNotificationJob): Promise<NotificationPayload | null>;
  now(): Date;
  retryReceiptDelivery(
    notification: TicketedNotification,
    errorCode: string,
    nextAttemptAt: string,
  ): Promise<void>;
  sendPush(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
}

export class NotificationTransportError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = 'NotificationTransportError';
  }
}

export function formatPushMessage(_payload: NotificationPayload): ExpoPushMessage {
  const generic = !_payload.previewsEnabled;
  const senderName = normalizeWhitespace(_payload.senderName).slice(0, 60) || 'Kin';
  const preview = _payload.kind === 'image'
    ? 'Shared a photo.'
    : _payload.kind === 'sticker'
      ? 'Sent a sticker.'
      : normalizeWhitespace(_payload.body).slice(0, 180) || 'Sent you a message.';
  return {
    body: generic ? 'Open Kin to see it.' : preview,
    channelId: 'messages',
    data: { path: `/space/${_payload.spaceId}`, spaceId: _payload.spaceId },
    sound: 'default',
    title: generic ? 'New Kin message' : senderName,
    to: _payload.expoPushToken,
  };
}

export async function runMessageNotificationWorker(
  dependencies: NotificationWorkerDependencies,
): Promise<NotificationWorkerSummary> {
  const summary: NotificationWorkerSummary = {
    claimed: 0,
    delivered: 0,
    failed: 0,
    incomplete: false,
    receiptsChecked: 0,
    retried: 0,
    ticketed: 0,
  };
  await dependencies.heartbeat({ claimed: 0, failed: 0, phase: 'running' });

  try {
    await reconcileReceipts(dependencies, summary);
    const jobs = await dependencies.claimJobs(100);
    summary.claimed = jobs.length;
    const deliverable: Array<{
      job: ClaimedNotificationJob;
      message: ExpoPushMessage;
    }> = [];

    for (const job of jobs) {
      const payload = await dependencies.loadPayload(job);
      if (!payload || payload.installationId !== job.installationId) {
        await dependencies.failJob(job, 'notification_target_unavailable', null);
        summary.failed += 1;
        continue;
      }
      if (!isExpoPushToken(payload.expoPushToken)) {
        await dependencies.deactivateInstallation(job.installationId);
        await dependencies.failJob(job, 'invalid_expo_token', null);
        summary.failed += 1;
        continue;
      }
      deliverable.push({ job, message: formatPushMessage(payload) });
    }

    if (deliverable.length > 0) {
      try {
        const tickets = await dependencies.sendPush(deliverable.map((item) => item.message));
        for (let index = 0; index < deliverable.length; index += 1) {
          const item = deliverable[index];
          const ticket = tickets[index];
          if (!ticket) {
            await retryOrFailJob(dependencies, item.job, 'missing_expo_ticket', summary);
          } else if (ticket.status === 'ok') {
            await dependencies.completeJob(item.job, ticket.id);
            summary.ticketed += 1;
          } else {
            await handleTicketError(dependencies, item.job, ticket.errorCode, summary);
          }
        }
      } catch (error) {
        const transport = error instanceof NotificationTransportError
          ? error
          : new NotificationTransportError('expo_unavailable', true);
        for (const item of deliverable) {
          if (transport.retryable) {
            await retryOrFailJob(dependencies, item.job, transport.code, summary);
          } else {
            await dependencies.failJob(item.job, transport.code, null);
            summary.failed += 1;
          }
        }
      }
    }

    summary.incomplete = summary.incomplete || summary.retried > 0;
    await dependencies.heartbeat({
      claimed: summary.claimed,
      failed: summary.failed + summary.retried,
      phase: summary.incomplete ? 'incomplete' : 'succeeded',
    });
    return summary;
  } catch (error) {
    try {
      await dependencies.heartbeat({
        claimed: summary.claimed,
        failed: Math.max(1, summary.failed + summary.retried),
        phase: 'incomplete',
      });
    } catch {
      // Preserve the original worker failure for the HTTP status and coarse log.
    }
    throw error;
  }
}

async function reconcileReceipts(
  dependencies: NotificationWorkerDependencies,
  summary: NotificationWorkerSummary,
): Promise<void> {
  const claimed = await dependencies.claimReceipts(300);
  if (claimed.length === 0) return;

  const ticketed: TicketedNotification[] = [];
  for (const notification of claimed) {
    if (receiptRetentionExpired(dependencies.now(), notification.ticketedAt)) {
      await dependencies.completeReceipt(
        notification,
        false,
        'missing_expo_receipt_expired',
      );
      summary.failed += 1;
    } else {
      ticketed.push(notification);
    }
  }
  if (ticketed.length === 0) return;

  let receipts: Record<string, ExpoPushReceipt>;
  try {
    receipts = await dependencies.getReceipts(ticketed.map((item) => item.ticketId));
  } catch {
    for (const notification of ticketed) {
      await dependencies.deferReceipt(
        notification,
        'expo_receipt_unavailable',
        receiptRetryAt(dependencies.now(), notification.receiptAttempts),
      );
    }
    summary.incomplete = true;
    return;
  }

  for (const notification of ticketed) {
    const receipt = receipts[notification.ticketId];
    if (!receipt) {
      if (receiptRetentionExpired(dependencies.now(), notification.ticketedAt)) {
        await dependencies.completeReceipt(
          notification,
          false,
          'missing_expo_receipt_expired',
        );
        summary.failed += 1;
      } else {
        await dependencies.deferReceipt(
          notification,
          'missing_expo_receipt',
          receiptRetryAt(dependencies.now(), notification.receiptAttempts),
        );
        summary.incomplete = true;
      }
      continue;
    }
    summary.receiptsChecked += 1;
    if (receipt.status === 'ok') {
      await dependencies.completeReceipt(notification, true, '');
      summary.delivered += 1;
      continue;
    }

    const code = normalizeProviderError(receipt.errorCode);
    if (code === 'device_not_registered') {
      await dependencies.deactivateInstallation(notification.installationId);
      await dependencies.completeReceipt(notification, false, code);
      summary.failed += 1;
    } else if (isTransientError(receipt.errorCode) && notification.attempts < 8) {
      await dependencies.retryReceiptDelivery(
        notification,
        code,
        retryAt(dependencies.now(), notification.attempts),
      );
      summary.retried += 1;
    } else {
      await dependencies.completeReceipt(notification, false, code);
      summary.failed += 1;
    }
  }
}

async function handleTicketError(
  dependencies: NotificationWorkerDependencies,
  job: ClaimedNotificationJob,
  providerCode: string,
  summary: NotificationWorkerSummary,
): Promise<void> {
  const code = normalizeProviderError(providerCode);
  if (code === 'device_not_registered') {
    await dependencies.deactivateInstallation(job.installationId);
    await dependencies.failJob(job, code, null);
    summary.failed += 1;
  } else if (isTransientError(providerCode)) {
    await retryOrFailJob(dependencies, job, code, summary);
  } else {
    await dependencies.failJob(job, code, null);
    summary.failed += 1;
  }
}

async function retryOrFailJob(
  dependencies: NotificationWorkerDependencies,
  job: ClaimedNotificationJob,
  code: string,
  summary: NotificationWorkerSummary,
): Promise<void> {
  if (job.attempts >= 8) {
    await dependencies.failJob(job, `${code}_retry_exhausted`.slice(0, 120), null);
    summary.failed += 1;
    return;
  }
  await dependencies.failJob(job, code, retryAt(dependencies.now(), job.attempts));
  summary.retried += 1;
}

function retryAt(now: Date, attempts: number): string {
  const delaySeconds = Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

function receiptRetryAt(now: Date, attempts: number): string {
  const delaySeconds = Math.min(3600, 900 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

function receiptRetentionExpired(now: Date, ticketedAt: string): boolean {
  const acceptedAt = Date.parse(ticketedAt);
  return !Number.isFinite(acceptedAt) || now.getTime() - acceptedAt >= 24 * 60 * 60 * 1000;
}

function isExpoPushToken(value: string): boolean {
  return /^(?:ExponentPushToken|ExpoPushToken)\[[^\]\s]{1,200}\]$/.test(value);
}

function isTransientError(value: string): boolean {
  return value === 'MessageRateExceeded'
    || value === 'InvalidCredentials'
    || value === 'MismatchSenderId'
    || value === 'expo_unavailable'
    || value === 'missing_expo_ticket';
}

function normalizeProviderError(value: string): string {
  if (value === 'DeviceNotRegistered') return 'device_not_registered';
  if (value === 'MessageTooBig') return 'message_too_big';
  if (value === 'MessageRateExceeded') return 'message_rate_exceeded';
  if (value === 'MismatchSenderId') return 'mismatched_sender';
  if (value === 'InvalidCredentials') return 'invalid_credentials';
  return 'expo_delivery_error';
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
