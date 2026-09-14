export type KinDeployment = 'demo' | 'development' | 'preview' | 'production';

export type KinEnvironment =
  | { deployment: 'demo'; mode: 'demo' }
  | {
      deployment: Exclude<KinDeployment, 'demo'>;
      mode: 'connected';
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

export function readEnvironment(values: EnvironmentValues = process.env): KinEnvironment {
  const deployment = values.EXPO_PUBLIC_KIN_ENVIRONMENT?.trim();
  if (!isDeployment(deployment)) {
    throw new ConfigurationError(
      'Set EXPO_PUBLIC_KIN_ENVIRONMENT to demo, development, preview, or production.',
    );
  }
  if (deployment === 'demo') return { deployment, mode: 'demo' };

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
  return {
    deployment,
    mode: 'connected',
    supabasePublishableKey,
    supabaseUrl,
  };
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
