import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';

interface StickerPickerProps {
  visible: boolean;
  onClose: () => void;
  onSend: (stickerId: string) => void;
}

export function StickerPicker({ onClose, onSend, visible }: StickerPickerProps) {
  if (!visible) return null;
  return (
    <View accessibilityViewIsModal style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Ours</Text>
          <Text style={styles.copy}>Stickers that only make sense here.</Text>
        </View>
        <Pressable accessibilityLabel="Close stickers" accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel="Send Jamie cooking sticker"
        accessibilityRole="button"
        onPress={() => onSend('sticker-jamie-chef')}
        style={({ pressed }) => [styles.sticker, pressed && styles.pressed]}
      >
        <Text style={styles.emoji}>🍳</Text>
        <Text style={styles.label}>chef jamie</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  closeText: { color: colors.plumInk, fontSize: 28 },
  copy: { color: colors.mutedInk, fontSize: 13, marginTop: 2 },
  emoji: { fontSize: 50 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.paper, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pressed: { opacity: 0.66 },
  sticker: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    marginTop: spacing.lg,
    minHeight: 100,
    minWidth: 112,
    padding: spacing.md,
  },
  title: { color: colors.plumInk, fontSize: 20, fontWeight: '800' },
  wrap: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: spacing.lg,
    position: 'absolute',
    right: 0,
    zIndex: 18,
  },
});
