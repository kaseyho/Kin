import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';
import type { MemoryItem } from '@/domain/models';

interface MomentCardProps {
  memory: MemoryItem;
  onOpen: (memoryId: string) => void;
  sourceExcerpt?: string;
  testID?: string;
}

export function MomentCard({ memory, onOpen, sourceExcerpt, testID }: MomentCardProps) {
  return (
    <Pressable
      accessibilityLabel={`Open ${memory.title}`}
      accessibilityRole="button"
      onPress={() => onOpen(memory.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={styles.keptCorner} />
      <Text style={styles.kind}>{kindLabel(memory.kind)}</Text>
      {memory.mediaUris[0] ? <Image accessibilityLabel={`Memory image: ${memory.title}`} source={{ uri: memory.mediaUris[0] }} style={styles.image} /> : null}
      <Text style={styles.title}>{memory.title}</Text>
      {memory.note ? <Text numberOfLines={3} style={styles.note}>{memory.note}</Text> : null}
      {sourceExcerpt ? <Text numberOfLines={2} style={styles.source}>From: “{sourceExcerpt}”</Text> : null}
      <Text style={styles.date}>{formatDate(memory.occurredOn)}</Text>
    </Pressable>
  );
}

export function kindLabel(kind: MemoryItem['kind']): string {
  if (kind === 'important_date') return 'IMPORTANT DATE';
  if (kind === 'plan') return 'PLAN';
  return 'MOMENT';
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.lg, borderWidth: 1, marginTop: spacing.md, overflow: 'hidden', padding: spacing.lg },
  date: { color: colors.mutedInk, fontSize: 11, marginTop: spacing.md },
  image: { borderRadius: radii.md, height: 190, marginBottom: spacing.md, marginTop: spacing.sm, width: '100%' },
  keptCorner: { borderBottomColor: 'transparent', borderBottomWidth: 22, borderRightColor: colors.rose, borderRightWidth: 22, height: 0, position: 'absolute', right: 0, top: 0, width: 0 },
  kind: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  note: { color: colors.mutedInk, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  pressed: { opacity: 0.72 },
  source: { borderTopColor: colors.keyline, borderTopWidth: 1, color: colors.mutedInk, fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginTop: spacing.md, paddingTop: spacing.md },
  title: { color: colors.plumInk, fontSize: 21, fontWeight: '800', letterSpacing: -0.4, marginTop: spacing.sm },
});
