export const MAX_MESSAGE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MESSAGE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type MessageImageMimeType = typeof MESSAGE_IMAGE_MIME_TYPES[number];

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: MessageImageMimeType;
}

export interface MediaPicker {
  pickImage(): Promise<PickedImage | null>;
}

export class MediaPermissionError extends Error {
  constructor() {
    super('Photo access is off. You can allow it in Settings, or keep messaging with text.');
    this.name = 'MediaPermissionError';
  }
}

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}
