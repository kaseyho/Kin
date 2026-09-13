import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const MEDIA_BUCKET = 'chat-media';
const MEDIA_REFERENCE_PREFIX = `storage://${MEDIA_BUCKET}/`;
const SIGNED_URL_LIFETIME_SECONDS = 60 * 60 * 24;

export function buildMediaObjectPath(
  spaceId: string,
  userId: string,
  sourceUri: string,
  mediaId: string,
): string {
  return `${spaceId}/${userId}/${mediaId}.${extensionForUri(sourceUri)}`;
}

export function toMediaStorageReference(path: string): string {
  return `${MEDIA_REFERENCE_PREFIX}${path.replace(/^\/+/, '')}`;
}

export function readMediaStorageReference(uri: string): string | null {
  return uri.startsWith(MEDIA_REFERENCE_PREFIX)
    ? uri.slice(MEDIA_REFERENCE_PREFIX.length)
    : null;
}

export async function uploadKinMedia(
  client: SupabaseClient<Database>,
  input: { mediaId: string; sourceUri: string; spaceId: string; userId: string },
): Promise<string> {
  if (readMediaStorageReference(input.sourceUri)) return input.sourceUri;
  const path = buildMediaObjectPath(input.spaceId, input.userId, input.sourceUri, input.mediaId);
  const bytes = await readMediaBytes(input.sourceUri);
  const result = await client.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: contentTypeForPath(path),
    upsert: false,
  });
  if (result.error) throw result.error;
  return toMediaStorageReference(result.data.path);
}

export async function resolveKinMedia(
  client: SupabaseClient<Database>,
  uri: string,
): Promise<string> {
  const path = readMediaStorageReference(uri);
  if (!path) return uri;
  const result = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_LIFETIME_SECONDS);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}

async function readMediaBytes(uri: string): Promise<ArrayBuffer> {
  if (uri.startsWith('file:') || uri.startsWith('content:')) {
    const { File } = await import('expo-file-system');
    return new File(uri).arrayBuffer();
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Media could not be read (${response.status}).`);
  return response.arrayBuffer();
}

function extensionForUri(uri: string): string {
  const withoutQuery = uri.split(/[?#]/, 1)[0] ?? '';
  const match = withoutQuery.match(/\.([a-zA-Z0-9]{2,5})$/);
  const extension = match?.[1]?.toLowerCase();
  return extension && ['avif', 'gif', 'heic', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)
    ? extension
    : 'jpg';
}

function contentTypeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'jpeg' || extension === 'jpg') return 'image/jpeg';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'avif') return 'image/avif';
  return 'application/octet-stream';
}
