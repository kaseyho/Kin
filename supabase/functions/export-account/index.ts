import { adminClient, authenticate, HttpError, json, preflight } from '../_shared/http.ts';

Deno.serve(async (request) => {
  const earlyResponse = preflight(request);
  if (earlyResponse) return earlyResponse;

  const operationId = crypto.randomUUID();
  let userId = 'unknown';
  try {
    const authenticated = await authenticate(request);
    userId = authenticated.user.id;
    const admin = adminClient();

    const profileResult = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
    assertQuery(profileResult.error);
    const membershipsResult = await admin.from('kin_space_members').select('*').eq('user_id', userId);
    assertQuery(membershipsResult.error);
    const memberships = membershipsResult.data ?? [];
    const spaceIds = memberships.map((membership) => membership.space_id);

    const [preferencesResult, messagesResult, reactionsResult, memoriesResult, invitesResult] =
      await Promise.all([
        spaceIds.length
          ? admin.from('space_themes').select('*').in('space_id', spaceIds).eq('user_id', userId)
          : Promise.resolve({ data: [], error: null }),
        admin.from('messages').select('*').eq('sender_id', userId).order('created_at'),
        admin.from('message_reactions').select('*').eq('user_id', userId).order('created_at'),
        admin.from('memory_items').select('*').eq('created_by', userId).order('created_at'),
        admin.from('space_invites').select('*').eq('created_by', userId).order('created_at'),
      ]);
    for (const result of [
      preferencesResult,
      messagesResult,
      reactionsResult,
      memoriesResult,
      invitesResult,
    ]) assertQuery(result.error);

    const memoryIds = (memoriesResult.data ?? []).map((memory) => memory.id);
    const sourceLinksResult = memoryIds.length
      ? await admin.from('memory_item_messages').select('*').in('memory_id', memoryIds)
      : { data: [], error: null };
    assertQuery(sourceLinksResult.error);

    return json({
      exportedAt: new Date().toISOString(),
      invites: invitesResult.data ?? [],
      memberships,
      memories: memoriesResult.data ?? [],
      messages: messagesResult.data ?? [],
      preferences: preferencesResult.data ?? [],
      profile: profileResult.data,
      reactions: reactionsResult.data ?? [],
      sourceLinks: sourceLinksResult.data ?? [],
      version: 1,
    });
  } catch (error) {
    console.error(JSON.stringify({ operationId, status: 'failed', userId }));
    if (error instanceof HttpError) return json({ error: error.code }, error.status);
    return json({ error: 'export_failed', operationId }, 500);
  }
});

function assertQuery(error: unknown): void {
  if (error) throw new Error('query_failed');
}
