import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { NotificationState } from '@/services/notifications/contracts';
import {
  NotificationContext,
  type NotificationContextValue,
} from '@/state/NotificationProvider';
import { NotificationEnablePrompt } from '../NotificationEnablePrompt';
import { NotificationSettings } from '../NotificationSettings';

const baseState: NotificationState = {
  deviceEnabled: true,
  installationRegistered: false,
  previewsEnabled: true,
  status: 'not-determined',
};

function Harness({
  children,
  overrides = {},
  state = baseState,
}: PropsWithChildren<{
  overrides?: Partial<NotificationContextValue>;
  state?: NotificationState;
}>) {
  const value: NotificationContextValue = {
    busy: false,
    deactivateCurrentInstallation: jest.fn(async () => undefined),
    error: '',
    openSettings: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    requestPermissionAndRegister: jest.fn(async () => undefined),
    setCurrentDeviceEnabled: jest.fn(async () => undefined),
    setPreviewsEnabled: jest.fn(async () => undefined),
    state,
    ...overrides,
  };
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

describe('notification controls', () => {
  it('offers permission contextually and only while permission is undecided', async () => {
    const requestPermissionAndRegister = jest.fn(async () => undefined);
    const user = userEvent.setup();
    const view = await render(
      <Harness overrides={{ requestPermissionAndRegister }}>
        <NotificationEnablePrompt partnerName="Jamie" />
      </Harness>,
    );

    expect(screen.getByText('Get a quiet heads-up when Jamie writes.')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Enable message notifications' }));
    expect(requestPermissionAndRegister).toHaveBeenCalledTimes(1);

    await view.unmount();
    await render(
      <Harness state={{ ...baseState, status: 'denied' }}>
        <NotificationEnablePrompt partnerName="Jamie" />
      </Harness>,
    );
    expect(screen.queryByLabelText('Message notification suggestion')).toBeNull();
  });

  it('sends denied users to device settings without retrying permission', async () => {
    const openSettings = jest.fn(async () => undefined);
    const user = userEvent.setup();
    await render(
      <Harness overrides={{ openSettings }} state={{ ...baseState, status: 'denied' }}>
        <NotificationSettings />
      </Harness>,
    );

    await user.press(screen.getByRole('button', { name: 'Open device settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('updates preview privacy and can remove the current device', async () => {
    const setCurrentDeviceEnabled = jest.fn(async () => undefined);
    const setPreviewsEnabled = jest.fn(async () => undefined);
    const user = userEvent.setup();
    await render(
      <Harness
        overrides={{ setCurrentDeviceEnabled, setPreviewsEnabled }}
        state={{ ...baseState, installationRegistered: true, status: 'granted' }}
      >
        <NotificationSettings />
      </Harness>,
    );

    fireEvent(screen.getByRole('switch', { name: 'Show message previews' }), 'valueChange', false);
    await user.press(screen.getByRole('button', { name: 'Turn off notifications on this device' }));

    await waitFor(() => expect(setPreviewsEnabled).toHaveBeenCalledWith(false));
    expect(setCurrentDeviceEnabled).toHaveBeenCalledWith(false);
  });

  it('explains missing native build configuration instead of offering a broken action', async () => {
    await render(
      <Harness state={{
        ...baseState,
        deviceEnabled: false,
        message: 'This build needs an EAS project ID before push can be enabled.',
        status: 'configuration-required',
      }}>
        <NotificationSettings />
      </Harness>,
    );

    expect(screen.getByText('Build setup needed')).toBeTruthy();
    expect(screen.getByText(/EAS project ID/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Enable message notifications/ })).toBeNull();
  });
});
