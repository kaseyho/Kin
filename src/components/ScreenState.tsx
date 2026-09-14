import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/design/tokens';

interface ScreenStateProps {
  eyebrow?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ScreenState({ actionLabel, eyebrow, message, onAction, title }: ScreenStateProps) {
  return (
    <View style={styles.container}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  actionText: { color: colors.paper, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  eyebrow: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  message: {
    color: colors.mutedInk,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.md,
    maxWidth: 320,
    textAlign: 'center',
  },
  pressed: { opacity: 0.72 },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 28, fontWeight: '700', textAlign: 'center' },
});
