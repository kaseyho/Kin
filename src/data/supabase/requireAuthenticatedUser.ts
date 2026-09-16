import { RepositoryError } from '../errors';

interface AuthUserLookup {
  getUser(): Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
}

export async function requireAuthenticatedUserId(auth: AuthUserLookup): Promise<string> {
  const result = await auth.getUser();
  if (result.error || !result.data.user) {
    throw new RepositoryError('auth_required', 'Sign in to use connected Kin.', 'reconnect');
  }
  return result.data.user.id;
}
