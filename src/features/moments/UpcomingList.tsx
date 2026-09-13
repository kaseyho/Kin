import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/design/tokens';
import type { UpcomingMemory } from '@/domain/selectors';

export function UpcomingList({ items }: { items: readonly UpcomingMemory[] }) {
  if (items.length === 0) return <Text style={styles.empty}>Nothing planned here yet.</Text>;
  return (
    <View>
      {items.map(({ daysAway, item, occursOn }) => (
        <View key={item.id} style={styles.row}>
          <Text style={styles.when}>{relativeDate(daysAway, occursOn)}</Text>
          <View style={styles.copy}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.kind}>{item.kind === 'plan' ? 'Plan' : 'Important date'}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function relativeDate(daysAway: number, occursOn: string): string {
  if (daysAway === 0) return 'Today';
  if (daysAway === 1) return 'Tomorrow';
  if (daysAway <= 7) return `In ${daysAway} days`;
  const [, month, day] = occursOn.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(Date.UTC(2020, month - 1, day)));
}

const styles = StyleSheet.create({
  copy: { flex: 1 },
  empty: { color: colors.mutedInk, fontSize: 14, marginTop: spacing.sm },
  kind: { color: colors.mutedInk, fontSize: 11, marginTop: 3 },
  row: { alignItems: 'center', borderBottomColor: colors.keyline, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  title: { color: colors.plumInk, fontSize: 15, fontWeight: '800' },
  when: { color: colors.rose, fontSize: 11, fontWeight: '900', width: 78 },
});
