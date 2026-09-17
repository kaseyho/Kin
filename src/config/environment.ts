export type KinDeployment = 'demo' | 'development' | 'preview' | 'production';

export type KinEnvironment =
  | { deployment: 'demo'; mode: 'demo'; publicAppUrl: string }
  | {
      deployment: Exclude<KinDeployment, 'demo'>;
      mode: 'connected';
      publicAppUrl: string;
      supabaseUrl: string;
      supabasePublishableKey: string;
    };

export type EnvironmentValues = Record<string, string | undefined>;

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function readPublicEnvironmentValues(): EnvironmentValues {
  // Expo statically substitutes direct EXPO_PUBLIC_* property reads in application bundles.
  // Keep these explicit rather than spreading or forwarding the process.env object.
  return {
    EXPO_PUBLIC_KIN_ENVIRONMENT: process.env.EXPO_PUBLIC_KIN_ENVIRONMENT,
    EXPO_PUBLIC_KIN_PUBLIC_URL: process.env.EXPO_PUBLIC_KIN_PUBLIC_URL,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:
      process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    EXPO_PUBLIC_REVENUECAT_WEB_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  };
}

export function readEnvironment(
  values: EnvironmentValues = readPublicEnvironmentValues(),
): KinEnvironment {
  const deployment = values.EXPO_PUBLIC_KIN_ENVIRONMENT?.trim();
  if (!isDeployment(deployment)) {
    throw new ConfigurationError(
      'Set EXPO_PUBLIC_KIN_ENVIRONMENT to demo, development, preview, or production.',
    );
  }
  if (deployment === 'demo') {
    return { deployment, mode: 'demo', publicAppUrl: 'https://demo.kin.invalid' };
  }

  const supabaseUrl = values.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey = values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new ConfigurationError('Connected Kin requires a Supabase URL and publishable key.');
  }
  if (!isAllowedUrl(supabaseUrl, deployment)) {
    throw new ConfigurationError(
      'Connected Kin requires an HTTPS Supabase URL outside local development.',
    );
  }
  if (!isAllowedPublicKey(supabasePublishableKey, deployment)) {
    throw new ConfigurationError(
      'Use a Supabase publishable key; never expose a secret or service-role key.',
    );
  }
  const publicAppUrl = normalizePublicAppUrl(
    values.EXPO_PUBLIC_KIN_PUBLIC_URL?.trim()
      || (deployment === 'development' ? 'http://localhost:8081' : ''),
    deployment,
  );
  return {
    deployment,
    mode: 'connected',
    publicAppUrl,
    supabasePublishableKey,
    supabaseUrl,
  };
}

function normalizePublicAppUrl(
  value: string,
  deployment: Exclude<KinDeployment, 'demo'>,
): string {
  try {
    const url = new URL(value);
    const isLoopback = isLoopbackHostname(url.hostname);
    const allowedProtocol = url.protocol === 'https:'
      || (deployment === 'development' && url.protocol === 'http:' && isLoopback);
    if (
      !allowedProtocol
      || (deployment !== 'development' && isLoopback)
      || !url.hostname
      || url.username
      || url.password
      || url.search
      || url.hash
    ) {
      throw new Error('invalid public URL');
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new ConfigurationError(
      'Kin requires a public HTTPS app URL outside local development.',
    );
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function isDeployment(value: string | undefined): value is KinDeployment {
  return value === 'demo' || value === 'development' || value === 'preview' || value === 'production';
}

function isAllowedUrl(value: string, deployment: Exclude<KinDeployment, 'demo'>): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || !url.hostname) return false;
    if (url.protocol === 'https:') return true;
    return deployment === 'development'
      && url.protocol === 'http:'
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function isAllowedPublicKey(
  value: string,
  deployment: Exclude<KinDeployment, 'demo'>,
): boolean {
  const normalized = value.toLowerCase();
  if (normalized.includes('service_role') || normalized.startsWith('sb_secret_')) return false;
  if (value.startsWith('sb_publishable_')) return true;
  return deployment === 'development' && value.startsWith('eyJ');
}
