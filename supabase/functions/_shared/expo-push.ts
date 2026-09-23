import type {
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
} from './message-notifications.ts';
import { NotificationTransportError } from './message-notifications.ts';

export interface ExpoPushTransport {
  getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>>;
  sendPush(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
}

export function createExpoPushTransport(_options: {
  accessToken?: string;
  fetch: typeof fetch;
}): ExpoPushTransport {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(_options.accessToken
      ? { Authorization: `Bearer ${_options.accessToken}` }
      : {}),
  };

  async function post(url: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await _options.fetch(url, {
        body: JSON.stringify(body),
        headers,
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new NotificationTransportError('expo_unavailable', true);
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const code = response.status === 401 || response.status === 403
        ? 'expo_unauthorized'
        : response.status === 429
          ? 'expo_rate_limited'
          : response.status >= 500 ? 'expo_unavailable' : 'expo_request_rejected';
      throw new NotificationTransportError(code, retryable);
    }
    try {
      return await response.json();
    } catch {
      throw new NotificationTransportError('expo_invalid_response', false);
    }
  }

  return {
    async getReceipts(ticketIds) {
      if (ticketIds.length < 1 || ticketIds.length > 1000) {
        throw new NotificationTransportError('expo_receipt_batch_invalid', false);
      }
      const raw = await post(
        'https://exp.host/--/api/v2/push/getReceipts',
        { ids: ticketIds },
      );
      const data = isRecord(raw) && isRecord(raw.data) ? raw.data : null;
      if (!data) throw new NotificationTransportError('expo_invalid_response', false);
      const receipts: Record<string, ExpoPushReceipt> = {};
      for (const ticketId of ticketIds) {
        const receipt = data[ticketId];
        if (!isRecord(receipt)) continue;
        if (receipt.status === 'ok') {
          receipts[ticketId] = { status: 'ok' };
        } else if (receipt.status === 'error') {
          receipts[ticketId] = {
            errorCode: providerErrorCode(receipt),
            status: 'error',
          };
        }
      }
      return receipts;
    },

    async sendPush(messages) {
      if (messages.length < 1 || messages.length > 100) {
        throw new NotificationTransportError('expo_message_batch_invalid', false);
      }
      const raw = await post('https://exp.host/--/api/v2/push/send', messages);
      const data = isRecord(raw) && Array.isArray(raw.data) ? raw.data : null;
      if (!data || data.length !== messages.length) {
        throw new NotificationTransportError('expo_invalid_response', false);
      }
      return data.map((ticket): ExpoPushTicket => {
        if (isRecord(ticket) && ticket.status === 'ok' && typeof ticket.id === 'string') {
          return { id: ticket.id, status: 'ok' };
        }
        if (isRecord(ticket) && ticket.status === 'error') {
          return { errorCode: providerErrorCode(ticket), status: 'error' };
        }
        return { errorCode: 'Unknown', status: 'error' };
      });
    },
  };
}

export { NotificationTransportError };

function providerErrorCode(value: Record<string, unknown>): string {
  return isRecord(value.details) && typeof value.details.error === 'string'
    ? value.details.error
    : 'Unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
