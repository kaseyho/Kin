import type { SupabaseClient } from '@supabase/supabase-js';

import { MAX_MESSAGE_IMAGE_BYTES } from '@/services/media/contracts';
import type { Database } from '../database.types';
import {
  buildMediaObjectPath,
  readMediaStorageReference,
  toMediaStorageReference,
  uploadKinMedia,
} from '../media';

describe('Supabase media references', () => {
  it('stores media under a Space and sender prefix without exposing a public bucket URL', () => {
    expect(
      buildMediaObjectPath(
        'space-id',
        'user-id',
        'file:///photos/first-date.JPG?edited=1',
        'media-id',
      ),
    ).toBe('space-id/user-id/media-id.jpg');
  });

  it('round-trips private storage references', () => {
    const reference = toMediaStorageReference('space-id/user-id/media-id.png');
    expect(reference).toBe('storage://chat-media/space-id/user-id/media-id.png');
    expect(readMediaStorageReference(reference)).toBe('space-id/user-id/media-id.png');
    expect(readMediaStorageReference('https://images.example/first-date.png')).toBeNull();
  });

  it('enforces measured bytes and uses idempotent normalized uploads', async () => {
    const upload = jest.fn(async (path: string) => ({ data: { path }, error: null }));
    const client = {
      storage: { from: jest.fn(() => ({ upload })) },
    } as unknown as SupabaseClient<Database>;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(1024),
      ok: true,
    } as Response);

    await uploadKinMedia(client, {
      byteSize: 1024,
      mediaId: 'message-id',
      mimeType: 'image/jpeg',
      sourceUri: 'https://images.kin.test/normalized.jpg',
      spaceId: 'space-id',
      userId: 'user-id',
    });

    expect(upload).toHaveBeenCalledWith(
      'space-id/user-id/message-id.jpg',
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: true },
    );
    fetchSpy.mockRestore();
  });

  it('rejects declared oversize media before reading or uploading it', async () => {
    const upload = jest.fn();
    const client = {
      storage: { from: jest.fn(() => ({ upload })) },
    } as unknown as SupabaseClient<Database>;
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(uploadKinMedia(client, {
      byteSize: MAX_MESSAGE_IMAGE_BYTES + 1,
      mediaId: 'message-id',
      mimeType: 'image/jpeg',
      sourceUri: 'https://images.kin.test/oversize.jpg',
      spaceId: 'space-id',
      userId: 'user-id',
    })).rejects.toThrow('10 MB or smaller');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
