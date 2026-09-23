import {
  formatPushMessage,
  type ClaimedNotificationJob,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
  type NotificationPayload,
  type NotificationWorkerDependencies,
  NotificationTransportError,
  runMessageNotificationWorker,
  type TicketedNotification,
} from './message-notifications.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const job: ClaimedNotificationJob = {
  attempts: 1,
  id: 'job-1',
  installationId: 'installation-1',
  messageId: 'message-1',
  processingToken: 'lease-1',
  recipientId: 'recipient-1',
  spaceId: 'space-1',
};

const payload: NotificationPayload = {
  body: 'Dinner at seven?\nBring the photo album.',
  expoPushToken: 'ExponentPushToken[device-1]',
  installationId: 'installation-1',
  kind: 'text',
  previewsEnabled: true,
  senderName: '  Maya   Chen  ',
  spaceId: 'space-1',
};

function dependencies(overrides: Partial<NotificationWorkerDependencies> = {}) {
  const calls = {
    completed: [] as Array<{ job: ClaimedNotificationJob; ticketId: string }>,
    deactivated: [] as string[],
    failed: [] as Array<{ code: string; nextAttemptAt: string | null }>,
    heartbeats: [] as Array<{ claimed: number; failed: number; phase: string }>,
    receiptCompletions: [] as Array<{ delivered: boolean; errorCode: string }>,
    receiptDeferrals: [] as Array<{ errorCode: string; nextAttemptAt: string }>,
    receiptDeliveryRetries: [] as Array<{ errorCode: string; nextAttemptAt: string }>,
    sent: [] as ExpoPushMessage[],
  };
  const value: NotificationWorkerDependencies = {
    claimJobs: async () => [],
    claimReceipts: async () => [],
    completeJob: async (target, ticketId) => {
      calls.completed.push({ job: target, ticketId });
    },
    completeReceipt: async (_target, delivered, errorCode) => {
      calls.receiptCompletions.push({ delivered, errorCode });
    },
    deactivateInstallation: async (installationId) => {
      calls.deactivated.push(installationId);
    },
    failJob: async (_target, code, nextAttemptAt) => {
      calls.failed.push({ code, nextAttemptAt });
    },
    getReceipts: async () => ({}),
    heartbeat: async (heartbeat) => {
      calls.heartbeats.push(heartbeat);
    },
    loadPayload: async () => payload,
    now: () => new Date('2026-09-17T00:00:00.000Z'),
    deferReceipt: async (_target, errorCode, nextAttemptAt) => {
      calls.receiptDeferrals.push({ errorCode, nextAttemptAt });
    },
    retryReceiptDelivery: async (_target, errorCode, nextAttemptAt) => {
      calls.receiptDeliveryRetries.push({ errorCode, nextAttemptAt });
    },
    sendPush: async (messages) => {
      calls.sent.push(...messages);
      return messages.map((_message, index) => ({ id: `ticket-${index + 1}`, status: 'ok' }));
    },
    ...overrides,
  };
  return { calls, value };
}

Deno.test('preview policy produces bounded content and a minimal authenticated route', () => {
  const enabled = formatPushMessage(payload);
  assert(enabled.title === 'Maya Chen', 'enabled preview should use a normalized sender name');
  assert(
    enabled.body === 'Dinner at seven? Bring the photo album.',
    'enabled preview should normalize message whitespace',
  );
  assert(enabled.data.spaceId === 'space-1', 'data should contain the Space ID');
  assert(enabled.data.path === '/space/space-1', 'data should contain only the canonical route');
  assert(!JSON.stringify(enabled.data).includes(payload.body), 'route data must not contain content');

  const disabled = formatPushMessage({ ...payload, previewsEnabled: false });
  assert(disabled.title === 'New Kin message', 'disabled previews require a generic title');
  assert(disabled.body === 'Open Kin to see it.', 'disabled previews require generic body copy');
  assert(!JSON.stringify(disabled).includes('Maya'), 'disabled previews must omit sender identity');
});

Deno.test('an empty run still records worker liveness independently of queue depth', async () => {
  const harness = dependencies();

  const result = await runMessageNotificationWorker(harness.value);

  assert(result.claimed === 0, 'empty queue should claim zero jobs');
  assert(harness.calls.heartbeats.length === 2, 'start and success heartbeats are required');
  assert(harness.calls.heartbeats[0].phase === 'running', 'the worker should record start');
  assert(harness.calls.heartbeats[1].phase === 'succeeded', 'empty work should record success');
});

Deno.test('invalid Expo tokens are deactivated without contacting Expo', async () => {
  const harness = dependencies({
    claimJobs: async () => [job],
    loadPayload: async () => ({ ...payload, expoPushToken: 'not-a-push-token' }),
  });

  const result = await runMessageNotificationWorker(harness.value);

  assert(harness.calls.sent.length === 0, 'invalid tokens must not leave the worker');
  assert(harness.calls.deactivated[0] === 'installation-1', 'invalid installation should deactivate');
  assert(harness.calls.failed[0].code === 'invalid_expo_token', 'failure should be coarse');
  assert(harness.calls.failed[0].nextAttemptAt === null, 'invalid tokens are terminal');
  assert(result.failed === 1, 'the summary should count the terminal failure');
});

Deno.test('transient Expo failures back off without changing the message', async () => {
  const harness = dependencies({
    claimJobs: async () => [job],
    sendPush: async () => {
      throw new NotificationTransportError('expo_unavailable', true);
    },
  });

  const result = await runMessageNotificationWorker(harness.value);

  assert(harness.calls.failed[0].code === 'expo_unavailable', 'provider detail should be normalized');
  assert(
    harness.calls.failed[0].nextAttemptAt === '2026-09-17T00:01:00.000Z',
    'first retry should back off for one minute',
  );
  assert(harness.calls.completed.length === 0, 'a failed send cannot be ticketed');
  assert(result.retried === 1, 'the retry should be visible only as a coarse count');
});

Deno.test('accepted Expo tickets are stored against the matching lease', async () => {
  const harness = dependencies({ claimJobs: async () => [job] });

  const result = await runMessageNotificationWorker(harness.value);

  assert(harness.calls.completed[0].job.processingToken === 'lease-1', 'lease must be preserved');
  assert(harness.calls.completed[0].ticketId === 'ticket-1', 'Expo ticket should be stored');
  assert(result.ticketed === 1, 'ticketed count should be reported');
});

Deno.test('credential mismatches back off without deactivating a valid device token', async () => {
  const harness = dependencies({
    claimJobs: async () => [job],
    sendPush: async () => [{ errorCode: 'MismatchSenderId', status: 'error' }],
  });

  const result = await runMessageNotificationWorker(harness.value);

  assert(harness.calls.deactivated.length === 0, 'credential failures are not device opt-outs');
  assert(harness.calls.failed[0].nextAttemptAt !== null, 'credential failures should retry');
  assert(result.retried === 1, 'the run should remain visibly incomplete');
});

Deno.test('receipts finalize delivery and deactivate an unregistered device', async () => {
  const ticketed: TicketedNotification = {
    attempts: 1,
    id: 'job-old',
    installationId: 'installation-old',
    receiptAttempts: 1,
    receiptProcessingToken: 'receipt-lease-old',
    ticketId: 'ticket-old',
    ticketedAt: '2026-09-16T23:40:00.000Z',
  };
  const harness = dependencies({
    getReceipts: async (): Promise<Record<string, ExpoPushReceipt>> => ({
      'ticket-old': { errorCode: 'DeviceNotRegistered', status: 'error' },
    }),
    claimReceipts: async () => [ticketed],
  });

  const result = await runMessageNotificationWorker(harness.value);

  assert(harness.calls.deactivated[0] === 'installation-old', 'unregistered device should deactivate');
  assert(!harness.calls.receiptCompletions[0].delivered, 'receipt should finish as failed');
  assert(
    harness.calls.receiptCompletions[0].errorCode === 'device_not_registered',
    'receipt error should be normalized',
  );
  assert(result.receiptsChecked === 1, 'receipt count should be visible');
});

Deno.test('a missing mature receipt is deferred without resending an accepted push', async () => {
  const ticketed: TicketedNotification = {
    attempts: 1,
    id: 'job-missing',
    installationId: 'installation-missing',
    receiptAttempts: 1,
    receiptProcessingToken: 'receipt-lease-missing',
    ticketId: 'ticket-missing',
    ticketedAt: '2026-09-16T23:40:00.000Z',
  };
  const harness = dependencies({
    getReceipts: async () => ({}),
    claimReceipts: async () => [ticketed],
  });

  const result = await runMessageNotificationWorker(harness.value);

  assert(
    harness.calls.receiptDeferrals[0].errorCode === 'missing_expo_receipt',
    'missing receipt should schedule another receipt lookup',
  );
  assert(harness.calls.receiptDeliveryRetries.length === 0, 'accepted push must not be sent again');
  assert(harness.calls.sent.length === 0, 'receipt uncertainty must not submit another notification');
  assert(result.incomplete, 'missing receipt should make the run visibly incomplete');
});

Deno.test('an accepted push becomes terminal unknown after retention even during a receipt outage', async () => {
  const ticketed: TicketedNotification = {
    attempts: 1,
    id: 'job-expired-receipt',
    installationId: 'installation-expired-receipt',
    receiptAttempts: 12,
    receiptProcessingToken: 'receipt-lease-expired',
    ticketId: 'ticket-expired',
    ticketedAt: '2026-09-15T23:00:00.000Z',
  };
  const harness = dependencies({
    claimReceipts: async () => [ticketed],
    getReceipts: async () => {
      throw new NotificationTransportError('expo_unavailable', true);
    },
  });

  const result = await runMessageNotificationWorker(harness.value);

  assert(harness.calls.receiptDeferrals.length === 0, 'expired receipts should not poll forever');
  assert(
    harness.calls.receiptCompletions[0].errorCode === 'missing_expo_receipt_expired',
    'expired uncertainty should end with a coarse terminal reason',
  );
  assert(result.failed === 1, 'expired receipt should count as terminal failure');
  assert(harness.calls.sent.length === 0, 'expired receipt must never resend the notification');
});

Deno.test('an explicit retryable receipt error may schedule a new delivery', async () => {
  const ticketed: TicketedNotification = {
    attempts: 1,
    id: 'job-rate-limited',
    installationId: 'installation-rate-limited',
    receiptAttempts: 1,
    receiptProcessingToken: 'receipt-lease-rate-limited',
    ticketId: 'ticket-rate-limited',
    ticketedAt: '2026-09-16T23:40:00.000Z',
  };
  const harness = dependencies({
    claimReceipts: async () => [ticketed],
    getReceipts: async () => ({
      'ticket-rate-limited': { errorCode: 'MessageRateExceeded', status: 'error' },
    }),
  });

  const result = await runMessageNotificationWorker(harness.value);

  assert(
    harness.calls.receiptDeliveryRetries[0].errorCode === 'message_rate_exceeded',
    'explicit provider retry should release the delivery with a coarse code',
  );
  assert(result.retried === 1, 'explicit delivery retry should be counted');
});

Deno.test('worker summaries never expose token, body, sender, or email content', async () => {
  const secretPayload = {
    ...payload,
    body: 'private-body@example.com',
    expoPushToken: 'ExponentPushToken[private-secret]',
    senderName: 'private-sender@example.com',
  };
  const harness = dependencies({
    claimJobs: async () => [job],
    loadPayload: async () => secretPayload,
    sendPush: async (): Promise<ExpoPushTicket[]> => [{ id: 'ticket-private', status: 'ok' }],
  });

  const result = await runMessageNotificationWorker(harness.value);
  const serialized = JSON.stringify(result);

  assert(!serialized.includes('private'), 'summary must omit all private values');
  assert(!serialized.includes('@'), 'summary must omit email-shaped values');
  assert(!serialized.includes('ExponentPushToken'), 'summary must omit tokens');
});
