import type { SupabaseClient } from '@supabase/supabase-js';

import {
  MAX_MESSAGE_IMAGE_BYTES,
  MESSAGE_IMAGE_MIME_TYPES,
  MediaValidationError,
  type MessageImageMimeType,
} from '@/services/media/contracts';
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
  input: {
    byteSize?: number;
    mediaId: string;
    mimeType?: MessageImageMimeType;
    sourceUri: string;
    spaceId: string;
    userId: string;
  },
): Promise<string> {
  if (readMediaStorageReference(input.sourceUri)) return input.sourceUri;
  if (input.mimeType && !MESSAGE_IMAGE_MIME_TYPES.includes(input.mimeType)) {
    throw new MediaValidationError('Choose a JPEG, PNG, or WebP image.');
  }
  if (input.byteSize !== undefined && (!Number.isFinite(input.byteSize) || input.byteSize < 1 || input.byteSize > MAX_MESSAGE_IMAGE_BYTES)) {
    throw new MediaValidationError('That processed image must be 10 MB or smaller.');
  }
  const path = buildMediaObjectPath(input.spaceId, input.userId, input.sourceUri, input.mediaId);
  const bytes = await readMediaBytes(input.sourceUri);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_MESSAGE_IMAGE_BYTES) {
    throw new MediaValidationError('That processed image must be 10 MB or smaller.');
  }
  const result = await client.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: input.mimeType ?? contentTypeForPath(path),
    upsert: true,
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

export async function deleteKinMedia(
  client: SupabaseClient<Database>,
  uri: string,
): Promise<void> {
  const path = readMediaStorageReference(uri);
  if (!path) return;
  const result = await client.storage.from(MEDIA_BUCKET).remove([path]);
  if (result.error) throw result.error;
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
