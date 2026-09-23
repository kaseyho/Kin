import type { StorageAdapter } from '@/data/contracts';
import { createUnavailableNotificationService, type NotificationService } from './contracts';

export function createPlatformNotificationService(
  _client: unknown,
  _storage: StorageAdapter,
): NotificationService {
  return createUnavailableNotificationService('Push notifications are available in the iOS and Android app.');
}
