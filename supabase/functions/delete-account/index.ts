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

    const membershipsResult = await admin
      .from('kin_space_members')
      .select('space_id')
      .eq('user_id', userId);
    if (membershipsResult.error) throw new Error('membership_lookup_failed');
    const spaceIds = (membershipsResult.data ?? []).map((membership) => membership.space_id);

    await removeOwnedObjects(admin, 'avatars', userId);
    for (const spaceId of spaceIds) {
      await removeOwnedObjects(admin, 'chat-media', `${spaceId}/${userId}`);
    }

    const preparation = await admin.rpc('prepare_account_deletion', {
      target_user_id: userId,
    });
    if (preparation.error) throw new Error('deletion_preparation_failed');

    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw new Error('auth_deletion_failed');

    console.log(JSON.stringify({ operationId, status: 'deleted', userId }));
    return json({ deleted: true, operationId });
  } catch (error) {
    console.error(JSON.stringify({ operationId, status: 'failed', userId }));
    if (error instanceof HttpError) return json({ error: error.code }, error.status);
    return json({ error: 'deletion_failed', operationId }, 500);
  }
});

async function removeOwnedObjects(
  admin: ReturnType<typeof adminClient>,
  bucket: string,
  prefix: string,
): Promise<void> {
  const paths: string[] = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const listed = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (listed.error) throw new Error('storage_list_failed');
    const objects = listed.data ?? [];
    paths.push(...objects.filter((item) => item.id).map((item) => `${prefix}/${item.name}`));
    if (objects.length < pageSize) break;
    offset += pageSize;
  }

  for (let index = 0; index < paths.length; index += 100) {
    const removed = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (removed.error) throw new Error('storage_delete_failed');
  }
}
