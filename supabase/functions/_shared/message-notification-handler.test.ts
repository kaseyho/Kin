import { createMessageNotificationHandler } from './message-notification-handler.ts';
import type { NotificationWorkerSummary } from './message-notifications.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const complete: NotificationWorkerSummary = {
  claimed: 0,
  delivered: 0,
  failed: 0,
  incomplete: false,
  receiptsChecked: 0,
  retried: 0,
  ticketed: 0,
};

Deno.test('notification worker HTTP handler requires the dedicated exact secret', async () => {
  let calls = 0;
  const handler = createMessageNotificationHandler({
    configuredSecret: () => '0123456789abcdef0123456789abcdef',
    runWorker: async () => {
      calls += 1;
      return complete;
    },
  });

  const missing = await handler(new Request('http://localhost', { method: 'POST' }));
  const wrong = await handler(new Request('http://localhost', {
    headers: { 'x-kin-cron-secret': '0123456789abcdef0123456789abcdeg' },
    method: 'POST',
  }));

  assert(missing.status === 401, 'missing secret should fail closed');
  assert(wrong.status === 401, 'wrong secret should fail closed');
  assert(calls === 0, 'unauthorized requests cannot run work');
});

Deno.test('notification worker HTTP handler returns a content-free empty-batch success', async () => {
  const secret = '0123456789abcdef0123456789abcdef';
  const handler = createMessageNotificationHandler({
    configuredSecret: () => secret,
    runWorker: async () => complete,
  });

  const response = await handler(new Request('http://localhost', {
    headers: { 'x-kin-cron-secret': secret },
    method: 'POST',
  }));
  const body = await response.text();

  assert(response.status === 200, 'empty work should be healthy');
  assert(body.includes('"claimed":0'), 'coarse summary should be returned');
  assert(!body.includes(secret), 'worker secret must never be echoed');
});

Deno.test('notification worker HTTP handler marks retrying work as incomplete', async () => {
  const secret = '0123456789abcdef0123456789abcdef';
  const handler = createMessageNotificationHandler({
    configuredSecret: () => secret,
    runWorker: async () => ({ ...complete, incomplete: true, retried: 1 }),
  });

  const response = await handler(new Request('http://localhost', {
    headers: { 'x-kin-cron-secret': secret },
    method: 'POST',
  }));

  assert(response.status === 500, 'incomplete delivery should trigger operational alerting');
});
