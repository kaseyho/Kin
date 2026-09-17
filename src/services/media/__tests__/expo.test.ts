import { SaveFormat } from 'expo-image-manipulator';

import { MAX_MESSAGE_IMAGE_BYTES, MediaValidationError } from '../contracts';
import { normalizePickedImage } from '../expo';

describe('message image normalization', () => {
  it('rejects unsupported content before invoking the image processor', async () => {
    const manipulate = jest.fn();

    await expect(normalizePickedImage({
      height: 800,
      mimeType: 'image/gif',
      uri: 'file:///animated.gif',
      width: 800,
    }, {
      manipulate,
      measureBytes: jest.fn(),
    })).rejects.toBeInstanceOf(MediaValidationError);

    expect(manipulate).not.toHaveBeenCalled();
  });

  it('caps the long edge and returns measured JPEG metadata', async () => {
    const manipulate = jest.fn(async () => ({
      height: 1365,
      uri: 'file:///normalized.jpg',
      width: 2048,
    }));

    const result = await normalizePickedImage({
      height: 4000,
      mimeType: 'image/heic',
      uri: 'file:///camera.heic',
      width: 6000,
    }, {
      manipulate,
      measureBytes: async () => 2_000_000,
    });

    expect(manipulate).toHaveBeenCalledWith(
      'file:///camera.heic',
      [{ resize: { width: 2048 } }],
      { compress: 0.86, format: SaveFormat.JPEG },
    );
    expect(result).toEqual({
      byteSize: 2_000_000,
      height: 1365,
      mimeType: 'image/jpeg',
      uri: 'file:///normalized.jpg',
      width: 2048,
    });
  });

  it('reduces quality and dimensions until the processed result fits', async () => {
    const sizes = [MAX_MESSAGE_IMAGE_BYTES + 1, MAX_MESSAGE_IMAGE_BYTES + 1, 7_000_000];
    let attempt = 0;
    const manipulate = jest.fn(async (_uri, actions) => ({
      height: actions[0]?.resize.height ?? actions[0]?.resize.width ?? 1800,
      uri: `file:///attempt-${++attempt}.webp`,
      width: actions[0]?.resize.width ?? actions[0]?.resize.height ?? 1800,
    }));

    const result = await normalizePickedImage({
      height: 3000,
      mimeType: 'image/webp',
      uri: 'file:///large.webp',
      width: 3000,
    }, {
      manipulate,
      measureBytes: async () => sizes.shift() ?? 7_000_000,
    });

    expect(manipulate).toHaveBeenCalledTimes(3);
    expect(manipulate.mock.calls[2]?.[1]).toEqual([{ resize: { width: 1600 } }]);
    expect(result.byteSize).toBe(7_000_000);
    expect(result.mimeType).toBe('image/webp');
  });

  it('rejects a processed image that remains above 10 MB', async () => {
    await expect(normalizePickedImage({
      height: 3000,
      mimeType: 'image/png',
      uri: 'file:///large.png',
      width: 3000,
    }, {
      manipulate: async () => ({ height: 1024, uri: 'file:///still-large.png', width: 1024 }),
      measureBytes: async () => MAX_MESSAGE_IMAGE_BYTES + 1,
    })).rejects.toThrow('larger than 10 MB');
  });
});
