import type { NotificationWorkerSummary } from './message-notifications.ts';
import { secureSecretEqual } from './cron-secret.ts';

export function createMessageNotificationHandler(_options: {
  configuredSecret: () => string | undefined;
  runWorker: () => Promise<NotificationWorkerSummary>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return response({ ok: true }, 200);
    if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);

    const configuredSecret = _options.configuredSecret();
    if (!configuredSecret) return response({ error: 'worker_not_configured' }, 500);
    if (!secureSecretEqual(request.headers.get('x-kin-cron-secret'), configuredSecret)) {
      return response({ error: 'authentication_required' }, 401);
    }

    try {
      const summary = await _options.runWorker();
      return response(summary, summary.incomplete ? 500 : 200);
    } catch {
      return response({ error: 'notification_worker_failed' }, 500);
    }
  };
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Access-Control-Allow-Headers': 'content-type, x-kin-cron-secret',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}
