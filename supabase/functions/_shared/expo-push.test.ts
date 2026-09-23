import {
  createExpoPushTransport,
  NotificationTransportError,
} from './expo-push.ts';
import type { ExpoPushMessage } from './message-notifications.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const message: ExpoPushMessage = {
  body: 'Hello',
  channelId: 'messages',
  data: { path: '/space/space-1', spaceId: 'space-1' },
  sound: 'default',
  title: 'Maya',
  to: 'ExponentPushToken[device-1]',
};

Deno.test('Expo transport sends a bounded JSON batch and keeps only coarse ticket fields', async () => {
  let requestUrl = '';
  let request: RequestInit | undefined;
  const transport = createExpoPushTransport({
    accessToken: 'expo-access-secret',
    fetch: (async (url, init) => {
      requestUrl = String(url);
      request = init;
      return Response.json({
        data: [
          { id: 'ticket-1', status: 'ok' },
          {
            details: { error: 'DeviceNotRegistered' },
            message: 'private provider detail',
            status: 'error',
          },
        ],
      });
    }) as typeof fetch,
  });

  const result = await transport.sendPush([message, { ...message, to: 'ExpoPushToken[device-2]' }]);

  assert(requestUrl === 'https://exp.host/--/api/v2/push/send', 'official send endpoint required');
  const headers = new Headers(request?.headers);
  assert(headers.get('authorization') === 'Bearer expo-access-secret', 'enhanced security token required');
  assert(headers.get('content-type') === 'application/json', 'JSON content type required');
  assert(Array.isArray(JSON.parse(String(request?.body))), 'send body should be a batch');
  assert(result[0].status === 'ok', 'first ticket should be accepted');
  assert(result[1].status === 'error', 'second ticket should be normalized as an error');
  assert(!JSON.stringify(result).includes('private provider detail'), 'provider message must be dropped');
});

Deno.test('Expo transport maps receipt IDs and omits provider messages', async () => {
  const transport = createExpoPushTransport({
    fetch: (async () => Response.json({
      data: {
        'ticket-1': { status: 'ok' },
        'ticket-2': {
          details: { error: 'MessageRateExceeded' },
          message: 'private receipt detail',
          status: 'error',
        },
      },
    })) as typeof fetch,
  });

  const result = await transport.getReceipts(['ticket-1', 'ticket-2']);

  assert(result['ticket-1'].status === 'ok', 'successful receipt should be retained');
  assert(result['ticket-2'].status === 'error', 'failed receipt should be retained');
  assert(!JSON.stringify(result).includes('private receipt detail'), 'receipt messages must be dropped');
});

Deno.test('Expo transport classifies rate limits and server failures as retryable', async () => {
  for (const status of [429, 503]) {
    const transport = createExpoPushTransport({
      fetch: (async () => new Response('provider detail', { status })) as typeof fetch,
    });
    try {
      await transport.sendPush([message]);
      throw new Error('expected transport failure');
    } catch (error) {
      assert(error instanceof NotificationTransportError, 'typed transport error required');
      assert(error.retryable, `${status} should be retryable`);
      assert(!error.message.includes('provider detail'), 'response body must not escape');
    }
  }
});
