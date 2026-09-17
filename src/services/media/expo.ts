import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat, type ImageResult } from 'expo-image-manipulator';

import {
  MAX_MESSAGE_IMAGE_BYTES,
  MediaPermissionError,
  MediaValidationError,
  type MediaPicker,
  type MessageImageMimeType,
  type PickedImage,
} from './contracts';

const MAX_LONG_EDGE = 2048;
const NORMALIZATION_ATTEMPTS = [
  { longEdge: 2048, quality: 0.86 },
  { longEdge: 2048, quality: 0.7 },
  { longEdge: 1600, quality: 0.64 },
  { longEdge: 1280, quality: 0.54 },
  { longEdge: 1024, quality: 0.44 },
] as const;

interface RawPickedImage {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
  mimeType?: string;
}

interface NormalizerDependencies {
  manipulate: (
    uri: string,
    actions: { resize: { width?: number; height?: number } }[],
    options: { compress: number; format: SaveFormat },
  ) => Promise<ImageResult>;
  measureBytes: (uri: string) => Promise<number>;
}

const defaultNormalizerDependencies: NormalizerDependencies = {
  manipulate: manipulateAsync,
  measureBytes: measureBytes,
};

export const expoMediaPicker: MediaPicker = {
  async pickImage(): Promise<PickedImage | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new MediaPermissionError();

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 0.86,
    });
    if (result.canceled) return null;

    const asset = result.assets[0];
    return normalizePickedImage({
      fileSize: asset.fileSize,
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType ?? undefined,
    });
  },
};

export async function normalizePickedImage(
  image: RawPickedImage,
  dependencies: NormalizerDependencies = defaultNormalizerDependencies,
): Promise<PickedImage> {
  const sourceMimeType = normalizeSourceMimeType(image.mimeType, image.uri);
  if (!sourceMimeType) {
    throw new MediaValidationError('Choose a JPEG, PNG, WebP, or HEIC image.');
  }
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) {
    throw new MediaValidationError('Kin could not read that image’s dimensions.');
  }

  const output = outputFormat(sourceMimeType);
  for (const attempt of NORMALIZATION_ATTEMPTS) {
    const longEdge = Math.min(MAX_LONG_EDGE, attempt.longEdge);
    const resize = resizeForLongEdge(image.width, image.height, longEdge);
    const result = await dependencies.manipulate(
      image.uri,
      resize ? [{ resize }] : [],
      { compress: attempt.quality, format: output.format },
    );
    const byteSize = await dependencies.measureBytes(result.uri);
    if (byteSize > 0 && byteSize <= MAX_MESSAGE_IMAGE_BYTES) {
      return {
        byteSize,
        height: result.height,
        mimeType: output.mimeType,
        uri: result.uri,
        width: result.width,
      };
    }
  }
  throw new MediaValidationError('That photo is still larger than 10 MB after processing. Choose a smaller image.');
}

function normalizeSourceMimeType(mimeType: string | undefined, uri: string): string | null {
  const normalized = mimeType?.trim().toLowerCase();
  if (normalized && ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(normalized)) {
    return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
  }
  const extension = uri.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase();
  return ({
    heic: 'image/heic',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  } as Record<string, string>)[extension ?? ''] ?? null;
}

function outputFormat(sourceMimeType: string): {
  format: SaveFormat;
  mimeType: MessageImageMimeType;
} {
  if (sourceMimeType === 'image/png') return { format: SaveFormat.PNG, mimeType: 'image/png' };
  if (sourceMimeType === 'image/webp') return { format: SaveFormat.WEBP, mimeType: 'image/webp' };
  return { format: SaveFormat.JPEG, mimeType: 'image/jpeg' };
}

function resizeForLongEdge(
  width: number,
  height: number,
  maximum: number,
): { width?: number; height?: number } | null {
  if (Math.max(width, height) <= maximum) return null;
  return width >= height ? { width: maximum } : { height: maximum };
}

async function measureBytes(uri: string): Promise<number> {
  try {
    const size = new File(uri).size;
    if (Number.isFinite(size) && size > 0) return size;
  } catch {
    // Blob URLs on web are measured through fetch below.
  }
  const response = await fetch(uri);
  if (!response.ok) throw new MediaValidationError('Kin could not finish processing that image.');
  return (await response.arrayBuffer()).byteLength;
}
