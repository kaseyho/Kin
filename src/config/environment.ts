export type KinEnvironment =
  | { mode: 'demo' }
  | {
      mode: 'connected';
      supabaseUrl: string;
      supabasePublishableKey: string;
    };

type EnvironmentValues = Record<string, string | undefined>;

export function readEnvironment(values: EnvironmentValues = process.env): KinEnvironment {
  const url = values.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !isSafeUrl(url) || !key.startsWith('sb_publishable_')) {
    return { mode: 'demo' };
  }
  return { mode: 'connected', supabasePublishableKey: key, supabaseUrl: url };
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
