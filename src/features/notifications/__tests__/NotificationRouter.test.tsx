import { act, render, waitFor } from '@testing-library/react-native';

import type { StorageAdapter } from '@/data/contracts';
import type { KinSnapshot } from '@/domain/models';
import { createDemoAccountService } from '@/services/account/demo';
import type { AuthState } from '@/services/auth/contracts';
import type {
  NotificationResponseHandoff,
  NotificationService,
  NotificationState,
} from '@/services/notifications/contracts';
import { AuthContext, type AuthContextValue } from '@/state/AuthProvider';
import { KinContext, type KinContextValue, type KinLoadStatus } from '@/state/KinProvider';
import { createTestRepository } from '../../../../tests/helpers/renderKin';
import { NotificationRouter, NotificationSignOutCleaner } from '../NotificationRouter';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const notificationState: NotificationState = {
  deviceEnabled: true,
  installationRegistered: true,
  previewsEnabled: true,
  status: 'granted',
};

function createStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set('kin.pending-notification.v1', initial);
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => { values.delete(key); },
    setItem: async (key, value) => { values.set(key, value); },
  };
  return { storage, values };
}

function createNotificationHarness(lastResponse: NotificationResponseHandoff | null = null) {
  let responseListener: ((response: NotificationResponseHandoff) => void) | null = null;
  const service: jest.Mocked<NotificationService> = {
    clearLastResponse: jest.fn(async () => undefined),
    deactivateCurrentInstallation: jest.fn(async () => undefined),
    getLastResponse: jest.fn(async () => lastResponse),
    load: jest.fn(async () => notificationState),
    openSettings: jest.fn(async () => undefined),
    requestPermissionAndRegister: jest.fn(async () => notificationState),
    setCurrentDeviceEnabled: jest.fn(async (_enabled: boolean) => notificationState),
    setPreviewsEnabled: jest.fn(async (_enabled: boolean) => notificationState),
    subscribeToResponses: jest.fn((listener) => {
      responseListener = listener;
      return jest.fn();
    }),
  };
  return {
    emit(response: NotificationResponseHandoff) {
      if (!responseListener) throw new Error('response listener is not ready');
      responseListener(response);
    },
    service,
  };
}

function RouterHarness({
  authState,
  kinStatus,
  service,
  snapshot,
  storage,
}: {
  authState: AuthState;
  kinStatus: KinLoadStatus;
  service: NotificationService;
  snapshot: KinSnapshot | null;
  storage: StorageAdapter;
}) {
  const auth: AuthContextValue = {
    accountService: createDemoAccountService(),
    requestOtp: async () => undefined,
    signOut: async () => undefined,
    state: authState,
    verifyOtp: async (email) => ({ email, id: 'maya' }),
  };
  const kin = {
    mode: 'connected',
    snapshot,
    status: kinStatus,
  } as KinContextValue;
  return (
    <AuthContext.Provider value={auth}>
      <KinContext.Provider value={kin}>
        <NotificationRouter service={service} storage={storage} />
      </KinContext.Provider>
    </AuthContext.Provider>
  );
}

const response: NotificationResponseHandoff = {
  data: {
    body: 'A private message body',
    path: '/space/space-maya-jamie',
    senderName: 'Jamie',
    spaceId: 'space-maya-jamie',
    token: 'secret',
  },
  id: 'notification-1:default',
};

describe('NotificationRouter', () => {
  let snapshot: KinSnapshot;

  beforeEach(async () => {
    mockReplace.mockReset();
    snapshot = await createTestRepository().resetDemo();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not navigate for an ordinary foreground receipt', async () => {
    const notifications = createNotificationHarness();
    const { storage } = createStorage();

    await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );
    await waitFor(() => expect(notifications.service.getLastResponse).toHaveBeenCalledTimes(1));

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('opens a tapped Space only when the signed-in user is still an active member', async () => {
    const notifications = createNotificationHarness();
    const { storage, values } = createStorage();
    await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );
    await waitFor(() => expect(notifications.service.subscribeToResponses).toHaveBeenCalledTimes(1));

    await act(async () => {
      notifications.emit(response);
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      params: { spaceId: 'space-maya-jamie' },
      pathname: '/space/[spaceId]',
    }));
    expect(values.has('kin.pending-notification.v1')).toBe(false);
    expect(notifications.service.clearLastResponse).toHaveBeenCalled();
  });

  it('keeps a cold-start tap private while signed out, then resumes after auth and profile restoration', async () => {
    const notifications = createNotificationHarness(response);
    const { storage, values } = createStorage();
    const view = await render(
      <RouterHarness
        authState={{ status: 'signed-out' }}
        kinStatus="idle"
        service={notifications.service}
        snapshot={null}
        storage={storage}
      />,
    );

    await waitFor(() => expect(values.get('kin.pending-notification.v1')).toBe(JSON.stringify({
      path: '/space/space-maya-jamie',
      spaceId: 'space-maya-jamie',
      version: 1,
    })));
    expect(values.get('kin.pending-notification.v1')).not.toContain('private');
    expect(values.get('kin.pending-notification.v1')).not.toContain('secret');
    expect(mockReplace).not.toHaveBeenCalled();

    await view.rerender(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="loading"
        service={notifications.service}
        snapshot={null}
        storage={storage}
      />,
    );
    expect(mockReplace).not.toHaveBeenCalled();

    await view.rerender(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      params: { spaceId: 'space-maya-jamie' },
      pathname: '/space/[spaceId]',
    }));
    expect(values.has('kin.pending-notification.v1')).toBe(false);
  });

  it.each([
    ['deleted Space', (value: KinSnapshot) => ({ ...value, spaces: [] })],
    ['left or blocked Space', (value: KinSnapshot) => ({
      ...value,
      members: value.members.filter((member) => member.userId !== 'maya'),
    })],
    ['different restored account', (value: KinSnapshot) => ({ ...value, currentUserId: 'someone-else' })],
  ])('falls back to Chats when the target is a %s', async (_label, changeSnapshot) => {
    const notifications = createNotificationHarness(response);
    const { storage, values } = createStorage();
    await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={changeSnapshot(snapshot)}
        storage={storage}
      />,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      params: { notice: 'notification-unavailable' },
      pathname: '/(tabs)/chats',
    }));
    expect(values.has('kin.pending-notification.v1')).toBe(false);
  });

  it('falls back safely and clears a malformed response', async () => {
    const malformed = { data: { body: 'private', path: '/profile', spaceId: 'space-1' }, id: 'bad' };
    const notifications = createNotificationHarness(malformed);
    const { storage, values } = createStorage();
    await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      params: { notice: 'notification-unavailable' },
      pathname: '/(tabs)/chats',
    }));
    expect(values.has('kin.pending-notification.v1')).toBe(false);
    expect(notifications.service.clearLastResponse).toHaveBeenCalledTimes(1);
  });

  it('handles duplicate response delivery at most once', async () => {
    const notifications = createNotificationHarness(response);
    const { storage } = createStorage();
    await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));

    await act(async () => {
      notifications.emit(response);
    });

    await waitFor(() => expect(notifications.service.clearLastResponse).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('retries the same response after pending-state persistence fails', async () => {
    const notifications = createNotificationHarness();
    const { storage, values } = createStorage();
    let failNextWrite = true;
    storage.setItem = jest.fn(async (key, value) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('storage unavailable');
      }
      values.set(key, value);
    });
    await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );
    await waitFor(() => expect(notifications.service.subscribeToResponses).toHaveBeenCalledTimes(1));

    await act(async () => {
      notifications.emit(response);
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(notifications.service.clearLastResponse).not.toHaveBeenCalled();

    await act(async () => {
      notifications.emit(response);
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(values.has('kin.pending-notification.v1')).toBe(false);
  });

  it('does not navigate until the durable pending destination is deleted', async () => {
    jest.useFakeTimers();
    const notifications = createNotificationHarness(response);
    const { storage, values } = createStorage();
    let failNextRemoval = true;
    storage.removeItem = jest.fn(async (key) => {
      if (failNextRemoval) {
        failNextRemoval = false;
        throw new Error('storage unavailable');
      }
      values.delete(key);
    });
    await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );

    await waitFor(() => expect(storage.removeItem).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(values.has('kin.pending-notification.v1')).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(storage.removeItem).toHaveBeenCalledTimes(2);
    expect(values.has('kin.pending-notification.v1')).toBe(false);
  });

  it('restarts durable cleanup when the loaded snapshot changes in flight', async () => {
    const notifications = createNotificationHarness(response);
    const { storage, values } = createStorage();
    let finishFirstRemoval: (() => void) | null = null;
    storage.removeItem = jest.fn((key) => {
      if (!finishFirstRemoval) {
        return new Promise<void>((resolve) => {
          finishFirstRemoval = () => {
            values.delete(key);
            resolve();
          };
        });
      }
      values.delete(key);
      return Promise.resolve();
    });
    const view = await render(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={snapshot}
        storage={storage}
      />,
    );
    await waitFor(() => expect(storage.removeItem).toHaveBeenCalledTimes(1));

    await view.rerender(
      <RouterHarness
        authState={{ status: 'signed-in', user: { email: 'maya@example.com', id: 'maya' } }}
        kinStatus="ready"
        service={notifications.service}
        snapshot={{ ...snapshot, unreadCounts: { ...snapshot.unreadCounts, other: 1 } }}
        storage={storage}
      />,
    );
    await act(async () => {
      finishFirstRemoval?.();
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(values.has('kin.pending-notification.v1')).toBe(false);
  });

  it('clears a pending handoff when the active user explicitly signs out', async () => {
    const notifications = createNotificationHarness();
    const { storage, values } = createStorage(JSON.stringify({
      path: '/space/space-maya-jamie',
      spaceId: 'space-maya-jamie',
      version: 1,
    }));
    const authenticated = (authState: AuthState): AuthContextValue => ({
      accountService: createDemoAccountService(),
      requestOtp: async () => undefined,
      signOut: async () => undefined,
      state: authState,
      verifyOtp: async (email) => ({ email, id: 'maya' }),
    });
    const view = await render(
      <AuthContext.Provider value={authenticated({
        status: 'signed-in',
        user: { email: 'maya@example.com', id: 'maya' },
      })}>
        <NotificationSignOutCleaner service={notifications.service} storage={storage} />
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(values.has('kin.pending-notification.v1')).toBe(true));

    await view.rerender(
      <AuthContext.Provider value={authenticated({ status: 'signed-out' })}>
        <NotificationSignOutCleaner service={notifications.service} storage={storage} />
      </AuthContext.Provider>,
    );

    await waitFor(() => expect(values.has('kin.pending-notification.v1')).toBe(false));
    expect(notifications.service.clearLastResponse).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not discard a cold-start handoff for an initially signed-out user', async () => {
    const notifications = createNotificationHarness();
    const { storage, values } = createStorage(JSON.stringify({
      path: '/space/space-maya-jamie',
      spaceId: 'space-maya-jamie',
      version: 1,
    }));
    const auth: AuthContextValue = {
      accountService: createDemoAccountService(),
      requestOtp: async () => undefined,
      signOut: async () => undefined,
      state: { status: 'signed-out' },
      verifyOtp: async (email) => ({ email, id: 'maya' }),
    };

    await render(
      <AuthContext.Provider value={auth}>
        <NotificationSignOutCleaner service={notifications.service} storage={storage} />
      </AuthContext.Provider>,
    );

    expect(values.has('kin.pending-notification.v1')).toBe(true);
    expect(notifications.service.clearLastResponse).not.toHaveBeenCalled();
  });
});
