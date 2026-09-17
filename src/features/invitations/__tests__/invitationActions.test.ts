import { Share } from 'react-native';

import { createInvitationActions } from '../invitationActions';

describe('invitation sharing', () => {
  it('uses the native share sheet and reports dismissal truthfully', async () => {
    const nativeShare = jest.fn()
      .mockResolvedValueOnce({ action: Share.sharedAction })
      .mockResolvedValueOnce({ action: Share.dismissedAction });
    const actions = createInvitationActions({
      clipboardWrite: jest.fn(),
      nativeShare,
      platform: 'ios',
    });

    await expect(actions.share('https://kin.example/invite/KIN123')).resolves.toBe('shared');
    await expect(actions.share('https://kin.example/invite/KIN123')).resolves.toBe('dismissed');
    expect(nativeShare).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://kin.example/invite/KIN123',
    }));
  });

  it('uses Web Share when available', async () => {
    const webShare = jest.fn(async () => undefined);
    const clipboardWrite = jest.fn(async () => true);
    const actions = createInvitationActions({
      clipboardWrite,
      nativeShare: jest.fn(),
      platform: 'web',
      webShare,
    });

    await expect(actions.share('https://kin.example/invite/KIN123')).resolves.toBe('shared');
    expect(webShare).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://kin.example/invite/KIN123',
    }));
    expect(clipboardWrite).not.toHaveBeenCalled();
  });

  it('distinguishes a cancelled Web Share from a failed one', async () => {
    const cancelledShare = jest.fn(async () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      throw error;
    });
    const cancelledClipboard = jest.fn(async () => true);
    const cancelled = createInvitationActions({
      clipboardWrite: cancelledClipboard,
      nativeShare: jest.fn(),
      platform: 'web',
      webShare: cancelledShare,
    });

    await expect(cancelled.share('https://kin.example/invite/KIN123')).resolves.toBe('dismissed');
    expect(cancelledClipboard).not.toHaveBeenCalled();

    const fallbackClipboard = jest.fn(async () => true);
    const failed = createInvitationActions({
      clipboardWrite: fallbackClipboard,
      nativeShare: jest.fn(),
      platform: 'web',
      webShare: jest.fn(async () => {
        throw new Error('not available');
      }),
    });
    await expect(failed.share('https://kin.example/invite/KIN123')).resolves.toBe('copied');
    expect(fallbackClipboard).toHaveBeenCalledWith('https://kin.example/invite/KIN123');
  });

  it('falls back to the clipboard when Web Share is unavailable', async () => {
    const clipboardWrite = jest.fn(async () => true);
    const actions = createInvitationActions({
      clipboardWrite,
      nativeShare: jest.fn(),
      platform: 'web',
    });

    await expect(actions.share('https://kin.example/invite/KIN123')).resolves.toBe('copied');
    await expect(actions.copy('https://kin.example/invite/KIN123')).resolves.toBe(true);
    expect(clipboardWrite).toHaveBeenCalledTimes(2);
  });
});
