export type NotificationStatus =
  | 'loading'
  | 'unavailable'
  | 'configuration-required'
  | 'not-determined'
  | 'denied'
  | 'granted';

export interface NotificationState {
  status: NotificationStatus;
  deviceEnabled: boolean;
  previewsEnabled: boolean;
  installationRegistered: boolean;
  message?: string;
}

export interface NotificationResponseHandoff {
  data: unknown;
  id: string;
}

export interface NotificationService {
  clearLastResponse(): Promise<void>;
  getLastResponse(): Promise<NotificationResponseHandoff | null>;
  load(): Promise<NotificationState>;
  requestPermissionAndRegister(): Promise<NotificationState>;
  setCurrentDeviceEnabled(enabled: boolean): Promise<NotificationState>;
  setPreviewsEnabled(enabled: boolean): Promise<NotificationState>;
  deactivateCurrentInstallation(): Promise<void>;
  openSettings(): Promise<void>;
  subscribeToResponses(listener: (response: NotificationResponseHandoff) => void): () => void;
}

export class NotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationError';
  }
}

export function createUnavailableNotificationService(message: string): NotificationService {
  let state: NotificationState = {
    deviceEnabled: false,
    installationRegistered: false,
    message,
    previewsEnabled: true,
    status: 'unavailable',
  };
  return {
    async clearLastResponse() { return undefined; },
    async getLastResponse() { return null; },
    async load() { return state; },
    async requestPermissionAndRegister() { return state; },
    async setCurrentDeviceEnabled() { return state; },
    async setPreviewsEnabled(enabled) {
      state = { ...state, previewsEnabled: enabled };
      return state;
    },
    async deactivateCurrentInstallation() { return undefined; },
    async openSettings() { return undefined; },
    subscribeToResponses() { return () => undefined; },
  };
}
