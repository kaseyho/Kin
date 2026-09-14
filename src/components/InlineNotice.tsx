import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';

interface InlineNoticeProps {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  tone?: 'danger' | 'neutral' | 'success';
}

export function InlineNotice({
  actionLabel,
  message,
  onAction,
  tone = 'danger',
}: InlineNoticeProps) {
  const color = tone === 'success' ? colors.success : tone === 'neutral' ? colors.plumInk : colors.danger;
  return (
    <View style={[styles.notice, tone === 'success' && styles.success, tone === 'neutral' && styles.neutral]}>
      <Text accessibilityRole="alert" style={[styles.message, { color }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  actionText: { fontSize: 13, fontWeight: '800' },
  message: { flex: 1, fontSize: 13, lineHeight: 19 },
  neutral: { backgroundColor: '#F1EBE6', borderColor: colors.keyline },
  notice: {
    alignItems: 'center',
    backgroundColor: '#FBE9E8',
    borderColor: '#E7BFC4',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing.md,
  },
  success: { backgroundColor: '#E9F2ED', borderColor: '#BCD5C8' },
});
