export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  mimeType?: string;
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
