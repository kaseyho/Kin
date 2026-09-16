import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.116.0';

export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}

export function preflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  return null;
}

export async function authenticate(request: Request): Promise<{
  accessToken: string;
  user: User;
}> {
  const authorization = request.headers.get('Authorization');
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) throw new HttpError(401, 'authentication_required');

  const publicClient = createClient(requiredEnv('SUPABASE_URL'), publicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await publicClient.auth.getUser(accessToken);
  if (result.error || !result.data.user) throw new HttpError(401, 'authentication_required');
  return { accessToken, user: result.data.user };
}

export function adminClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function requireFreshToken(accessToken: string, maxAgeSeconds = 600): void {
  const payload = decodeJwtPayload(accessToken);
  const issuedAt = typeof payload.iat === 'number' ? payload.iat : null;
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt === null || issuedAt > now + 60 || now - issuedAt > maxAgeSeconds) {
    throw new HttpError(401, 'fresh_authentication_required');
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'HttpError';
  }
}

function publicKey(): string {
  return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? Deno.env.get('SUPABASE_ANON_KEY')
    ?? requiredEnv('SUPABASE_PUBLISHABLE_KEY');
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1];
  if (!encoded) throw new HttpError(401, 'fresh_authentication_required');
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(`${normalized}${padding}`)) as Record<string, unknown>;
  } catch {
    throw new HttpError(401, 'fresh_authentication_required');
  }
}
