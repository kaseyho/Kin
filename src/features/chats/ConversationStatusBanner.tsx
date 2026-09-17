import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/design/tokens';
import type { ConnectivityPhase } from '@/state/ConnectivityProvider';

const COPY: Partial<Record<ConnectivityPhase, string>> = {
  offline: 'You’re offline. You can keep writing and retry when you reconnect.',
  reconnecting: 'Reconnecting… Your conversation stays available.',
  restored: 'Back online. Kin is up to date.',
};

export function ConversationStatusBanner({ phase }: { phase: ConnectivityPhase }) {
  const message = COPY[phase];
  if (!message) return null;
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.banner, phase === 'offline' && styles.offline]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.paper,
    borderBottomColor: colors.keyline,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  offline: { backgroundColor: '#FFF4ED' },
  text: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
