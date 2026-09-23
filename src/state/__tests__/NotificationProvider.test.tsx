import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { NotificationService, NotificationState } from '@/services/notifications/contracts';
import { NotificationProvider } from '../NotificationProvider';
import { useNotifications } from '../useNotifications';

const available: NotificationState = {
  deviceEnabled: true,
  installationRegistered: false,
  previewsEnabled: true,
  status: 'not-determined',
};

function createService(): jest.Mocked<NotificationService> {
  return {
    clearLastResponse: jest.fn(async () => undefined),
    deactivateCurrentInstallation: jest.fn(async () => undefined),
    getLastResponse: jest.fn(async () => null),
    load: jest.fn(async () => available),
    openSettings: jest.fn(async () => undefined),
    requestPermissionAndRegister: jest.fn(async (): Promise<NotificationState> => ({
      ...available,
      installationRegistered: true,
      status: 'granted',
    })),
    setCurrentDeviceEnabled: jest.fn(async (enabled): Promise<NotificationState> => ({
      ...available,
      deviceEnabled: enabled,
      installationRegistered: enabled,
      status: 'granted',
    })),
    setPreviewsEnabled: jest.fn(async (enabled) => ({ ...available, previewsEnabled: enabled })),
    subscribeToResponses: jest.fn((
      _listener: Parameters<NotificationService['subscribeToResponses']>[0],
    ) => () => undefined),
  };
}

function Probe() {
  const notifications = useNotifications();
  return (
    <>
      <Text>{notifications.state.status}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void notifications.requestPermissionAndRegister()}
      >
        <Text>Request notifications</Text>
      </Pressable>
    </>
  );
}

describe('NotificationProvider', () => {
  it('does not inspect or prompt for notification permission before a product session is active', async () => {
    const service = createService();
    await render(
      <NotificationProvider active={false} service={service}>
        <Probe />
      </NotificationProvider>,
    );

    expect(service.load).not.toHaveBeenCalled();
    expect(service.requestPermissionAndRegister).not.toHaveBeenCalled();
    expect(screen.getByText('unavailable')).toBeTruthy();
  });

  it('loads state for an active session without requesting permission', async () => {
    const service = createService();
    await render(
      <NotificationProvider active service={service}>
        <Probe />
      </NotificationProvider>,
    );

    expect(await screen.findByText('not-determined')).toBeTruthy();
    expect(service.load).toHaveBeenCalledTimes(1);
    expect(service.requestPermissionAndRegister).not.toHaveBeenCalled();
  });

  it('requests permission only after an explicit action', async () => {
    const service = createService();
    const user = userEvent.setup();
    await render(
      <NotificationProvider active service={service}>
        <Probe />
      </NotificationProvider>,
    );
    await screen.findByText('not-determined');

    await user.press(screen.getByRole('button', { name: 'Request notifications' }));

    await waitFor(() => expect(service.requestPermissionAndRegister).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('granted')).toBeTruthy();
  });
});
