import type { SupabaseClient } from '@supabase/supabase-js';

import { MAX_MESSAGE_IMAGE_BYTES } from '@/services/media/contracts';
import type { Database } from '../database.types';
import {
  buildMediaObjectPath,
  deleteUnreferencedMemoryMedia,
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

  it('deletes a memory object only when no visible memory row references it', async () => {
    const remove = jest.fn(async () => ({ data: [], error: null }));
    const maybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'memory-1' }, error: null });
    const query = {
      contains: jest.fn(),
      limit: jest.fn(),
      maybeSingle,
      select: jest.fn(),
    } as Record<string, jest.Mock>;
    query.select.mockReturnValue(query);
    query.contains.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const client = {
      from: jest.fn(() => query),
      storage: { from: jest.fn(() => ({ remove })) },
    } as unknown as SupabaseClient<Database>;
    const reference = toMediaStorageReference('space-id/user-id/memory-id.jpg');

    await expect(deleteUnreferencedMemoryMedia(client, reference)).resolves.toBe(true);
    await expect(deleteUnreferencedMemoryMedia(client, reference)).resolves.toBe(false);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(['space-id/user-id/memory-id.jpg']);
  });

  it('keeps a memory object when the reference check itself fails', async () => {
    const remove = jest.fn();
    const query = {
      contains: jest.fn(),
      limit: jest.fn(),
      maybeSingle: jest.fn(async () => ({ data: null, error: { message: 'offline' } })),
      select: jest.fn(),
    } as Record<string, jest.Mock>;
    query.select.mockReturnValue(query);
    query.contains.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const client = {
      from: jest.fn(() => query),
      storage: { from: jest.fn(() => ({ remove })) },
    } as unknown as SupabaseClient<Database>;

    await expect(deleteUnreferencedMemoryMedia(
      client,
      toMediaStorageReference('space-id/user-id/memory-id.jpg'),
    )).resolves.toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
