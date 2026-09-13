import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';

interface MessageActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onRemember: () => void;
}

export function MessageActionSheet({
  onClose,
  onReact,
  onRemember,
  visible,
}: MessageActionSheetProps) {
  if (!visible) return null;
  return (
    <View accessibilityViewIsModal style={styles.overlay}>
      <Pressable accessibilityLabel="Close message actions" onPress={onClose} style={styles.scrim} />
      <View style={styles.sheet}>
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
      </View>
    </View>
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
  overlay: {
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
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
  scrim: {
    backgroundColor: 'rgba(47,35,43,0.30)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
