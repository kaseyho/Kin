import {
  AccountDeletionError,
} from '../_shared/account-deletion.ts';
import { executeSupabaseAccountDeletion } from '../_shared/supabase-account-deletion.ts';
import {
  adminClient,
  authenticate,
  HttpError,
  json,
  preflight,
  requireFreshToken,
} from '../_shared/http.ts';

Deno.serve(async (request) => {
  const earlyResponse = preflight(request);
  if (earlyResponse) return earlyResponse;

  const operationId = crypto.randomUUID();
  let userId = 'unknown';
  try {
    const authenticated = await authenticate(request);
    userId = authenticated.user.id;
    requireFreshToken(authenticated.accessToken);
    const admin = adminClient();

    const result = await executeSupabaseAccountDeletion(admin, operationId, userId);

    console.log(JSON.stringify({
      cleanupPending: result.cleanupPending,
      operationId,
      status: result.cleanupPending ? 'deleted_cleanup_pending' : 'deleted',
      userId,
    }));
    return json({ ...result, operationId });
  } catch (error) {
    const failureCode = error instanceof AccountDeletionError ? error.code : 'deletion_failed';
    console.error(JSON.stringify({ operationId, status: failureCode, userId }));
    if (error instanceof HttpError) return json({ error: error.code }, error.status);
    return json({ error: failureCode, operationId }, 500);
  }
});
