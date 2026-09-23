import type { SupabaseClient } from '@supabase/supabase-js';

import type { StorageAdapter } from '@/data/contracts';
import type { Database } from '@/data/supabase/database.types';
import {
  createPlatformNotificationService,
  type NativeNotificationDependencies,
} from '../expo.native';

function createHarness(options: {
  permission?: { canAskAgain: boolean; granted: boolean };
  projectId?: string | null;
} = {}) {
  const values = new Map<string, string>();
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => { values.delete(key); },
    setItem: async (key, value) => { values.set(key, value); },
  };
  let previewsEnabled = true;
  const rpc: jest.Mock = jest.fn(async (name: string) => ({
    data: name === 'deactivate_push_installation' ? true : 'installation-row',
    error: null,
  }));
  const from = jest.fn(() => ({
    select: () => ({
      maybeSingle: async () => ({
        data: { notification_previews_enabled: previewsEnabled },
        error: null,
      }),
    }),
    update: (value: { notification_previews_enabled: boolean }) => ({
      select: () => ({
        single: async () => {
          previewsEnabled = value.notification_previews_enabled;
          return { data: { notification_previews_enabled: previewsEnabled }, error: null };
        },
      }),
    }),
  }));
  const permission = options.permission ?? { canAskAgain: true, granted: false };
  const dependencies: NativeNotificationDependencies = {
    getPermissions: jest.fn(async () => permission) as unknown as NativeNotificationDependencies['getPermissions'],
    getProjectId: () => options.projectId === undefined ? 'project-1' : options.projectId,
    getPushToken: jest.fn(async () => ({ data: 'ExponentPushToken[kin-device-0001]', type: 'expo' })) as NativeNotificationDependencies['getPushToken'],
    isDevice: true,
    openSettings: jest.fn(async () => undefined),
    platform: 'ios',
    prepareAndroidChannel: jest.fn(async () => undefined),
    randomUuid: () => 'installation-0001',
    requestPermissions: jest.fn(async () => ({ canAskAgain: true, granted: true })) as unknown as NativeNotificationDependencies['requestPermissions'],
  };
  const client = { from, rpc } as unknown as SupabaseClient<Database>;
  return {
    client,
    dependencies,
    rpc,
    service: createPlatformNotificationService(client, storage, dependencies),
    storage,
    values,
  };
}

describe('native notification installation service', () => {
  it('loads permission state without prompting, then registers only after an explicit request', async () => {
    const harness = createHarness();

    await expect(harness.service.load()).resolves.toMatchObject({
      installationRegistered: false,
      status: 'not-determined',
    });
    expect(harness.dependencies.requestPermissions).not.toHaveBeenCalled();
    expect(harness.rpc).not.toHaveBeenCalledWith('register_push_installation', expect.anything());

    await expect(harness.service.requestPermissionAndRegister()).resolves.toMatchObject({
      installationRegistered: true,
      status: 'granted',
    });
    expect(harness.dependencies.requestPermissions).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith('register_push_installation', {
      target_expo_push_token: 'ExponentPushToken[kin-device-0001]',
      target_installation_id: 'installation-0001',
      target_platform: 'ios',
    });
  });

  it('does not prompt when the build is missing an EAS project ID', async () => {
    const harness = createHarness({ projectId: null });

    await expect(harness.service.requestPermissionAndRegister()).resolves.toMatchObject({
      message: expect.stringContaining('EAS project ID'),
      status: 'configuration-required',
    });
    expect(harness.dependencies.requestPermissions).not.toHaveBeenCalled();
  });

  it('refreshes and re-registers the Expo token when permission is already granted', async () => {
    const harness = createHarness({ permission: { canAskAgain: true, granted: true } });

    await expect(harness.service.load()).resolves.toMatchObject({
      installationRegistered: true,
      status: 'granted',
    });
    expect(harness.dependencies.getPushToken).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(harness.dependencies.requestPermissions).not.toHaveBeenCalled();
  });

  it('keeps an explicitly disabled device unregistered until the user reconnects it', async () => {
    const harness = createHarness({ permission: { canAskAgain: true, granted: true } });
    await harness.storage.setItem('kin.notification-device-disabled.v1', 'true');

    await expect(harness.service.load()).resolves.toMatchObject({
      deviceEnabled: false,
      installationRegistered: false,
      status: 'granted',
    });
    expect(harness.rpc).not.toHaveBeenCalledWith('register_push_installation', expect.anything());

    await expect(harness.service.setCurrentDeviceEnabled(true)).resolves.toMatchObject({
      deviceEnabled: true,
      installationRegistered: true,
    });
    expect(harness.dependencies.requestPermissions).not.toHaveBeenCalled();
  });

  it('updates the account-level preview preference', async () => {
    const harness = createHarness();

    await expect(harness.service.setPreviewsEnabled(false)).resolves.toMatchObject({
      previewsEnabled: false,
    });
  });

  it('records a failed deactivation and rotates the local installation ID', async () => {
    const harness = createHarness({ permission: { canAskAgain: true, granted: true } });
    await harness.service.load();
    harness.rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });

    await harness.service.deactivateCurrentInstallation();

    expect(harness.values.get('kin.notification-deactivation.v1')).toBe('installation-0001');
    expect(harness.values.has('kin.notification-installation.v1')).toBe(false);
  });

  it('retries a pending deactivation on the next authenticated load', async () => {
    const harness = createHarness();
    await harness.storage.setItem('kin.notification-deactivation.v1', 'installation-old');

    await harness.service.load();

    expect(harness.rpc).toHaveBeenCalledWith('deactivate_push_installation', {
      target_installation_id: 'installation-old',
    });
    expect(harness.values.has('kin.notification-deactivation.v1')).toBe(false);
  });

  it('proves a safe token transfer when a different account cannot deactivate the previous row', async () => {
    const harness = createHarness({ permission: { canAskAgain: true, granted: true } });
    await harness.storage.setItem('kin.notification-deactivation.v1', 'installation-old');
    harness.rpc.mockResolvedValueOnce({ data: false, error: null });

    await harness.service.load();

    expect(harness.rpc).toHaveBeenCalledWith('register_push_installation', {
      previous_installation_id: 'installation-old',
      target_expo_push_token: 'ExponentPushToken[kin-device-0001]',
      target_installation_id: 'installation-0001',
      target_platform: 'ios',
    });
    expect(harness.values.has('kin.notification-deactivation.v1')).toBe(false);
  });
});
