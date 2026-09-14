import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { kinAssets } from '@/design/assets';
import { colors, radii, spacing } from '@/design/tokens';

interface StickerPickerProps {
  visible: boolean;
  onClose: () => void;
  onSend: (stickerId: string) => void;
}

export function StickerPicker({ onClose, onSend, visible }: StickerPickerProps) {
  return (
    <AccessibleSheet
      closeLabel="Close stickers"
      label="Relationship stickers"
      onClose={onClose}
      sheetStyle={styles.wrap}
      visible={visible}
    >
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
        <Image accessibilityLabel="Jamie cooking" source={kinAssets.jamieSticker} style={styles.stickerImage} />
        <Text style={styles.label}>chef jamie</Text>
      </Pressable>
    </AccessibleSheet>
  );
}

const styles = StyleSheet.create({
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  closeText: { color: colors.plumInk, fontSize: 28 },
  copy: { color: colors.mutedInk, fontSize: 13, marginTop: 2 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.plumInk, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pressed: { opacity: 0.66 },
  sticker: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F7EFE9',
    borderRadius: radii.lg,
    marginTop: spacing.lg,
    minHeight: 100,
    minWidth: 112,
    padding: spacing.md,
  },
  stickerImage: { height: 116, width: 116 },
  title: { color: colors.plumInk, fontSize: 20, fontWeight: '800' },
  wrap: {
    borderColor: colors.keyline,
    borderTopWidth: 1,
  },
});
