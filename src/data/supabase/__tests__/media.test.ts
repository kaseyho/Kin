import {
  buildMediaObjectPath,
  readMediaStorageReference,
  toMediaStorageReference,
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
});
