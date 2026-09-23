import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { KinDeployment } from '@/config/environment';
import type { StorageAdapter } from '@/data/contracts';
import type { Database } from '@/data/supabase/database.types';
import { createUnavailableNotificationService, type NotificationService } from './contracts';
import { createPlatformNotificationService } from './expo';

export function createNotificationService(options: {
  client?: SupabaseClient<Database>;
  deployment: KinDeployment;
  platform?: typeof Platform.OS;
  storage: StorageAdapter;
}): NotificationService {
  const platform = options.platform ?? Platform.OS;
  if (options.deployment === 'demo') {
    return createUnavailableNotificationService('Push notifications stay off in the local demo.');
  }
  if (platform === 'web') {
    return createUnavailableNotificationService('Push notifications are available in the iOS and Android app.');
  }
  if (!options.client) {
    return createUnavailableNotificationService('Push notifications need a connected Kin build.');
  }
  return createPlatformNotificationService(options.client, options.storage);
}
