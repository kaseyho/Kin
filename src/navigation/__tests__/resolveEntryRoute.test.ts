import type { KinSnapshot } from '@/domain/models';
import { resolveEntryRoute } from '../resolveEntryRoute';

const signedInSnapshot: KinSnapshot = {
  currentUserId: 'user-1',
  members: [],
  memories: [],
  messages: [],
  messagePages: {},
  unreadCounts: {},
  profiles: [{
    avatarUri: '',
    createdAt: '2026-09-14T00:00:00.000Z',
    displayName: 'Maya',
    id: 'user-1',
  }],
  schemaVersion: 1,
  spaces: [],
};

describe('resolveEntryRoute', () => {
  it('keeps content closed while auth is restoring', () => {
    expect(resolveEntryRoute({
      authState: { status: 'loading' },
      kinStatus: 'idle',
      snapshot: null,
    })).toBe('loading');
  });

  it('sends a connected signed-out user to auth', () => {
    expect(resolveEntryRoute({
      authState: { status: 'signed-out' },
      kinStatus: 'idle',
      snapshot: null,
    })).toBe('/auth');
  });

  it('waits for private data after a session is restored', () => {
    expect(resolveEntryRoute({
      authState: {
        status: 'signed-in',
        user: { id: 'user-1', email: 'maya@example.com' },
      },
      kinStatus: 'loading',
      snapshot: null,
    })).toBe('loading');
  });

  it('sends a signed-in user without a matching profile to onboarding', () => {
    expect(resolveEntryRoute({
      authState: {
        status: 'signed-in',
        user: { id: 'user-1', email: 'maya@example.com' },
      },
      kinStatus: 'ready',
      snapshot: { ...signedInSnapshot, profiles: [] },
    })).toBe('/onboarding');
  });

  it('sends a signed-in user with a matching profile to chats', () => {
    expect(resolveEntryRoute({
      authState: {
        status: 'signed-in',
        user: { id: 'user-1', email: 'maya@example.com' },
      },
      kinStatus: 'ready',
      snapshot: signedInSnapshot,
    })).toBe('/(tabs)/chats');
  });

  it('preserves the demo first-run and seeded-story routes', () => {
    expect(resolveEntryRoute({
      authState: { status: 'demo' },
      kinStatus: 'ready',
      snapshot: { ...signedInSnapshot, currentUserId: null, profiles: [] },
    })).toBe('/onboarding');
    expect(resolveEntryRoute({
      authState: { status: 'demo' },
      kinStatus: 'ready',
      snapshot: signedInSnapshot,
    })).toBe('/(tabs)/chats');
  });
});
