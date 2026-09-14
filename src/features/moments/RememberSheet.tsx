import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { colors, spacing } from '@/design/tokens';
import type { MemoryKind } from '@/domain/models';

interface RememberSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: MemoryKind) => void;
}

const choices: { kind: MemoryKind; title: string; copy: string }[] = [
  { kind: 'moment', title: 'Moment', copy: 'A story you want to return to.' },
  { kind: 'important_date', title: 'Important date', copy: 'A day worth carrying forward.' },
  { kind: 'plan', title: 'Plan', copy: 'Something the two of you want to do.' },
];

export function RememberSheet({ onClose, onSelect, visible }: RememberSheetProps) {
  return (
    <AccessibleSheet
      closeLabel="Close Remember this"
      label="Remember this"
      onClose={onClose}
      visible={visible}
    >
        <Text style={styles.eyebrow}>REMEMBER THIS</Text>
        <Text accessibilityRole="header" style={styles.title}>What should this become?</Text>
        <Text style={styles.intro}>You choose what it means. Kin keeps the source with it.</Text>
        {choices.map((choice) => (
          <Pressable
            accessibilityLabel={`Remember as ${choice.title}`}
            accessibilityRole="button"
            key={choice.kind}
            onPress={() => onSelect(choice.kind)}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
          >
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceTitle}>{choice.title}</Text>
              <Text style={styles.copy}>{choice.copy}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
    </AccessibleSheet>
  );
}

const styles = StyleSheet.create({
  arrow: { color: colors.rose, fontSize: 28 },
  choice: { alignItems: 'center', borderTopColor: colors.keyline, borderTopWidth: 1, flexDirection: 'row', minHeight: 72, paddingVertical: spacing.md },
  choiceCopy: { flex: 1 },
  choiceTitle: { color: colors.plumInk, fontSize: 17, fontWeight: '800' },
  copy: { color: colors.mutedInk, fontSize: 13, marginTop: 3 },
  eyebrow: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  intro: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginBottom: spacing.xl, marginTop: spacing.sm },
  pressed: { opacity: 0.65 },
  title: { color: colors.plumInk, fontSize: 27, fontWeight: '800', letterSpacing: -0.7, marginTop: spacing.xs },
});
