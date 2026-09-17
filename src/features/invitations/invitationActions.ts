import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

export type InvitationShareResult = 'shared' | 'copied' | 'dismissed';

export interface InvitationActions {
  copy(url: string): Promise<boolean>;
  share(url: string): Promise<InvitationShareResult>;
}

interface InvitationActionDependencies {
  clipboardWrite: (value: string) => Promise<boolean>;
  nativeShare: (content: {
    message: string;
    title: string;
    url: string;
  }) => Promise<{ action: string }>;
  platform: typeof Platform.OS;
  webShare?: (data: { text: string; title: string; url: string }) => Promise<void>;
}

export function createInvitationActions({
  clipboardWrite,
  nativeShare,
  platform,
  webShare,
}: InvitationActionDependencies): InvitationActions {
  return {
    copy: clipboardWrite,
    async share(url) {
      if (platform === 'web') {
        if (webShare) {
          try {
            await webShare({
              text: 'Join me in our private Kin Space.',
              title: 'Your Kin invitation',
              url,
            });
            return 'shared';
          } catch (reason) {
            if (reason instanceof Error && reason.name === 'AbortError') return 'dismissed';
          }
        }
        return (await clipboardWrite(url)) ? 'copied' : 'dismissed';
      }

      const result = await nativeShare({
        message: `Join me in our private Kin Space. ${url}`,
        title: 'Your Kin invitation',
        url,
      });
      return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
    },
  };
}

const webNavigator = typeof navigator === 'undefined' ? undefined : navigator;

export const invitationActions = createInvitationActions({
  clipboardWrite: (url) => Clipboard.setStringAsync(url),
  nativeShare: (content) => Share.share(content),
  platform: Platform.OS,
  webShare: webNavigator?.share
    ? (data) => webNavigator.share(data)
    : undefined,
});
