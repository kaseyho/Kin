import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';

interface ComposerProps {
  partnerName: string;
  text: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onPhoto: () => void;
  onSticker: () => void;
}

export function Composer({
  onChangeText,
  onPhoto,
  onSend,
  onSticker,
  partnerName,
  text,
}: ComposerProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel="Send a photo"
        accessibilityRole="button"
        onPress={onPhoto}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Text style={styles.icon}>＋</Text>
      </Pressable>
      <TextInput
        accessibilityLabel={`Message ${partnerName}`}
        multiline
        onChangeText={onChangeText}
        placeholder={`Message ${partnerName}`}
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
        value={text}
      />
      <Pressable
        accessibilityLabel="Open relationship stickers"
        accessibilityRole="button"
        onPress={onSticker}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Text style={styles.stickerIcon}>☺</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Send"
        accessibilityRole="button"
        disabled={!text.trim()}
        onPress={onSend}
        style={({ pressed }) => [
          styles.sendButton,
          !text.trim() && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.sendLabel}>↑</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.38 },
  icon: { color: colors.plumInk, fontSize: 25, fontWeight: '300', lineHeight: 27 },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 44,
    justifyContent: 'center',
    width: 40,
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: 22,
    borderWidth: 1,
    color: colors.plumInk,
    flex: 1,
    fontSize: 16,
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  pressed: { opacity: 0.62 },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sendLabel: { color: colors.paper, fontSize: 24, fontWeight: '700', lineHeight: 25 },
  stickerIcon: { color: colors.plumInk, fontSize: 22, lineHeight: 24 },
  wrap: {
    alignItems: 'flex-end',
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
});
