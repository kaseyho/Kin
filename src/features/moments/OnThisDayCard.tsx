import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';
import type { MemoryItem } from '@/domain/models';

interface OnThisDayCardProps {
  memory: MemoryItem;
  partnerName: string;
  onOpen: (memoryId: string) => void;
}

export function OnThisDayCard({ memory, onOpen, partnerName }: OnThisDayCardProps) {
  return (
    <Pressable accessibilityLabel={`Open ${memory.title}`} accessibilityRole="button" onPress={() => onOpen(memory.id)} style={styles.card}>
      <View style={styles.headingRow}>
        <Text style={styles.eyebrow}>On this day</Text>
        <Text style={styles.year}>{memory.occurredOn.slice(0, 4)}</Text>
      </View>
      <Text style={styles.title}>{memory.title}</Text>
      {memory.note ? <Text numberOfLines={3} style={styles.note}>{memory.note}</Text> : null}
      <Text style={styles.source}>From your message with {partnerName}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#F2E5E9', borderColor: '#E1C9D1', borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden', padding: spacing.xl },
  eyebrow: { color: colors.rose, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  note: { color: colors.mutedInk, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  source: { color: colors.rose, fontSize: 11, fontWeight: '700', marginTop: spacing.lg },
  title: { color: colors.plumInk, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: spacing.md },
  year: { color: colors.mutedInk, fontSize: 11 },
});
