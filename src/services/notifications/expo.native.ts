import type { SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { StorageAdapter } from '@/data/contracts';
import type { Database } from '@/data/supabase/database.types';
import {
  NotificationError,
  type NotificationService,
  type NotificationState,
} from './contracts';

const INSTALLATION_ID_KEY = 'kin.notification-installation.v1';
const PENDING_DEACTIVATION_KEY = 'kin.notification-deactivation.v1';
const DEVICE_DISABLED_KEY = 'kin.notification-device-disabled.v1';

export interface NativeNotificationDependencies {
  getProjectId: () => string | null;
  getPermissions: typeof Notifications.getPermissionsAsync;
  requestPermissions: typeof Notifications.requestPermissionsAsync;
  getPushToken: typeof Notifications.getExpoPushTokenAsync;
  isDevice: boolean;
  openSettings: () => Promise<void>;
  platform: 'ios' | 'android';
  prepareAndroidChannel: () => Promise<void>;
  randomUuid: () => string;
}

const defaultDependencies: NativeNotificationDependencies = {
  getProjectId: () => Constants.easConfig?.projectId
    ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId
    ?? null,
  getPermissions: Notifications.getPermissionsAsync,
  requestPermissions: Notifications.requestPermissionsAsync,
  getPushToken: Notifications.getExpoPushTokenAsync,
  isDevice: Device.isDevice,
  openSettings: Linking.openSettings,
  platform: Platform.OS === 'android' ? 'android' : 'ios',
  prepareAndroidChannel: async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('messages', {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: 'Messages',
    });
  },
  randomUuid: randomUuid,
};

export function createPlatformNotificationService(
  client: SupabaseClient<Database>,
  storage: StorageAdapter,
  dependencies: NativeNotificationDependencies = defaultDependencies,
): NotificationService {
  let state: NotificationState = {
    deviceEnabled: true,
    installationRegistered: false,
    previewsEnabled: true,
    status: 'loading',
  };

  async function loadPreviewsEnabled(): Promise<boolean> {
    const result = await client.from('profiles')
      .select('notification_previews_enabled')
      .maybeSingle();
    if (result.error) return state.previewsEnabled;
    return result.data?.notification_previews_enabled ?? true;
  }

  async function retryPendingDeactivation(): Promise<void> {
    const pendingInstallationId = await storage.getItem(PENDING_DEACTIVATION_KEY);
    if (!pendingInstallationId) return;
    const result = await client.rpc('deactivate_push_installation', {
      target_installation_id: pendingInstallationId,
    });
    if (!result.error && result.data === true) {
      await storage.removeItem(PENDING_DEACTIVATION_KEY);
    }
  }

  async function installationId(): Promise<string> {
    const existing = await storage.getItem(INSTALLATION_ID_KEY);
    if (existing) return existing;
    const created = dependencies.randomUuid();
    await storage.setItem(INSTALLATION_ID_KEY, created);
    return created;
  }

  async function register(projectId: string): Promise<NotificationState> {
    await dependencies.prepareAndroidChannel();
    const token = await dependencies.getPushToken({ projectId });
    const previousInstallationId = await storage.getItem(PENDING_DEACTIVATION_KEY);
    const result = await client.rpc('register_push_installation', {
      ...(previousInstallationId
        ? { previous_installation_id: previousInstallationId }
        : {}),
      target_expo_push_token: token.data,
      target_installation_id: await installationId(),
      target_platform: dependencies.platform,
    });
    if (result.error) {
      throw new NotificationError('Kin could not register this device for notifications. Try again.');
    }
    if (previousInstallationId) await storage.removeItem(PENDING_DEACTIVATION_KEY);
    state = {
      ...state,
      deviceEnabled: true,
      installationRegistered: true,
      message: undefined,
      status: 'granted',
    };
    return state;
  }

  const service: NotificationService = {
    async load() {
      state = { ...state, previewsEnabled: await loadPreviewsEnabled() };
      await retryPendingDeactivation();
      if (!dependencies.isDevice) {
        state = {
          ...state,
          deviceEnabled: false,
          installationRegistered: false,
          message: 'Push notifications require a physical device.',
          status: 'unavailable',
        };
        return state;
      }
      const projectId = dependencies.getProjectId();
      if (!projectId) {
        state = {
          ...state,
          deviceEnabled: false,
          installationRegistered: false,
          message: 'This build needs an EAS project ID before push can be enabled.',
          status: 'configuration-required',
        };
        return state;
      }
      const permission = await dependencies.getPermissions();
      const deviceEnabled = await storage.getItem(DEVICE_DISABLED_KEY) !== 'true';
      if (permission.granted && deviceEnabled) return register(projectId);
      state = {
        ...state,
        deviceEnabled,
        installationRegistered: false,
        message: permission.granted && !deviceEnabled
          ? 'Notifications are off for this device.'
          : undefined,
        status: permission.granted
          ? 'granted'
          : permission.canAskAgain ? 'not-determined' : 'denied',
      };
      return state;
    },

    async requestPermissionAndRegister() {
      if (!dependencies.isDevice) return service.load();
      const projectId = dependencies.getProjectId();
      if (!projectId) return service.load();
      await storage.removeItem(DEVICE_DISABLED_KEY);
      await dependencies.prepareAndroidChannel();
      const existingPermission = await dependencies.getPermissions();
      const permission = existingPermission.granted
        ? existingPermission
        : await dependencies.requestPermissions();
      if (!permission.granted) {
        state = {
          ...state,
          deviceEnabled: true,
          installationRegistered: false,
          status: 'denied',
        };
        return state;
      }
      return register(projectId);
    },

    async setCurrentDeviceEnabled(enabled) {
      if (enabled) {
        await storage.removeItem(DEVICE_DISABLED_KEY);
        return service.requestPermissionAndRegister();
      }
      await service.deactivateCurrentInstallation();
      await storage.setItem(DEVICE_DISABLED_KEY, 'true');
      state = {
        ...state,
        deviceEnabled: false,
        installationRegistered: false,
        message: 'Notifications are off for this device.',
      };
      return state;
    },

    async setPreviewsEnabled(enabled) {
      const result = await client.from('profiles')
        .update({ notification_previews_enabled: enabled })
        .select('notification_previews_enabled')
        .single();
      if (result.error) {
        throw new NotificationError('Kin could not update notification previews. Try again.');
      }
      state = { ...state, previewsEnabled: result.data.notification_previews_enabled };
      return state;
    },

    async deactivateCurrentInstallation() {
      const currentInstallationId = await storage.getItem(INSTALLATION_ID_KEY);
      if (!currentInstallationId) return;
      const result = await client.rpc('deactivate_push_installation', {
        target_installation_id: currentInstallationId,
      });
      if (result.error) {
        await storage.setItem(PENDING_DEACTIVATION_KEY, currentInstallationId);
        await storage.removeItem(INSTALLATION_ID_KEY);
      } else {
        await storage.removeItem(PENDING_DEACTIVATION_KEY);
      }
      state = { ...state, installationRegistered: false };
    },

    openSettings: dependencies.openSettings,
  };
  return service;
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
