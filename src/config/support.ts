export const DEFAULT_KIN_SUPPORT_EMAIL = 'support@kin.invalid';

const SUPPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSupportEmail(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!SUPPORT_EMAIL_PATTERN.test(normalized)) return null;
  const domain = normalized.split('@')[1];
  if (
    domain === 'localhost'
    || domain.endsWith('.localhost')
    || domain.endsWith('.invalid')
    || domain.endsWith('.example')
    || domain.endsWith('.test')
  ) {
    return null;
  }
  return normalized;
}

export function readPublicSupportEmail(): string {
  return normalizeSupportEmail(process.env.EXPO_PUBLIC_KIN_SUPPORT_EMAIL)
    ?? DEFAULT_KIN_SUPPORT_EMAIL;
}

export function createSupportMailto(supportEmail: string): string {
  return `mailto:${supportEmail}?subject=${encodeURIComponent('Kin support')}`;
}
