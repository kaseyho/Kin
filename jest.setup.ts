/// <reference types="jest" />

// React Native Testing Library 14 installs its Jest matchers on first import.

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test-device]' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: false })),
  setLastNotificationResponseAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
}));
