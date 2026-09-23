import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/design/tokens';
import { useNotifications } from '@/state/useNotifications';

export function NotificationEnablePrompt({ partnerName }: { partnerName: string }) {
  const notifications = useNotifications();
  if (notifications.state.status !== 'not-determined') return null;

  return (
    <View accessibilityLabel="Message notification suggestion" style={styles.prompt}>
      <View style={styles.copyWrap}>
        <Text style={styles.title}>Stay close when you’re apart</Text>
        <Text style={styles.copy}>Get a quiet heads-up when {partnerName} writes.</Text>
      </View>
      <Pressable
        accessibilityLabel="Enable message notifications"
        accessibilityRole="button"
        disabled={notifications.busy}
        onPress={() => void notifications.requestPermissionAndRegister()}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>{notifications.busy ? 'Enabling…' : 'Enable'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  buttonText: { color: colors.rose, fontFamily: typography.bodyStrong, fontSize: 13 },
  copy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  copyWrap: { flex: 1 },
  pressed: { opacity: 0.68 },
  prompt: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderBottomColor: colors.keyline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 66,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 13 },
});
