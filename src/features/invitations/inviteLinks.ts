import { isLoopbackHostname } from '@/config/environment';

const INVITE_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

export function normalizeInviteCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return INVITE_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function createInviteUrl(publicAppUrl: string, inviteCode: string): string {
  const code = normalizeInviteCode(inviteCode);
  if (!code) throw new Error('Kin received an invalid invitation code.');

  let url: URL;
  try {
    url = new URL(publicAppUrl);
  } catch {
    throw new Error('Kin received an invalid public app URL.');
  }
  const isLoopback = isLoopbackHostname(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
    || !url.hostname
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error('Kin received an invalid public app URL.');
  }

  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/invite/${code}`;
  return url.toString();
}
