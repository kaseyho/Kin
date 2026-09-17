import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { colors, radii, spacing } from '@/design/tokens';

interface MessageActionSheetProps {
  reportIsDemo?: boolean;
  visible: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onRemember: () => void;
  onReport?: () => void;
}

export function MessageActionSheet({
  onClose,
  onReact,
  onRemember,
  onReport,
  reportIsDemo = false,
  visible,
}: MessageActionSheetProps) {
  return (
    <AccessibleSheet
      closeLabel="Close message actions"
      label="Message actions"
      onClose={onClose}
      visible={visible}
    >
        <Text style={styles.eyebrow}>THIS MESSAGE</Text>
        <View style={styles.reactionRow}>
          <Action label="React with heart" onPress={() => onReact('❤️')} visual="❤️" />
          <Action label="React with laugh" onPress={() => onReact('😂')} visual="😂" />
          <Action label="React with sparkle" onPress={() => onReact('✨')} visual="✨" />
        </View>
        <Pressable
          accessibilityLabel="Remember this"
          accessibilityRole="button"
          onPress={onRemember}
          style={styles.remember}
        >
          <View>
            <Text style={styles.rememberTitle}>Remember this</Text>
            <Text style={styles.rememberCopy}>Keep it as a Moment, date, or plan.</Text>
          </View>
          <Text style={styles.arrow}>↗</Text>
        </Pressable>
        {onReport ? (
          <Pressable
            accessibilityLabel="Report this message"
            accessibilityRole="button"
            onPress={onReport}
            style={styles.report}
          >
            <Text style={styles.reportTitle}>Report this message</Text>
            <Text style={styles.reportCopy}>
              {reportIsDemo
                ? 'Preview the report flow. Demo reports stay on this device.'
                : 'Send it privately to Kin for safety review.'}
            </Text>
          </Pressable>
        ) : null}
    </AccessibleSheet>
  );
}

function Action({ label, onPress, visual }: { label: string; onPress: () => void; visual: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.reactionButton, pressed && styles.pressed]}
    >
      <Text style={styles.reactionEmoji}>{visual}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  arrow: { color: colors.rose, fontSize: 24 },
  eyebrow: { color: colors.mutedInk, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  pressed: { opacity: 0.65 },
  reactionButton: {
    alignItems: 'center',
    backgroundColor: colors.parchment,
    borderRadius: radii.round,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  reactionEmoji: { fontSize: 22 },
  reactionRow: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.lg },
  report: { borderTopColor: colors.keyline, borderTopWidth: 1, marginTop: spacing.lg, minHeight: 62, paddingTop: spacing.lg },
  reportCopy: { color: colors.mutedInk, fontSize: 12, marginTop: 3 },
  reportTitle: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  remember: {
    alignItems: 'center',
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 70,
    padding: spacing.lg,
  },
  rememberCopy: { color: colors.mutedInk, fontSize: 13, marginTop: 3 },
  rememberTitle: { color: colors.plumInk, fontSize: 16, fontWeight: '800' },
});
