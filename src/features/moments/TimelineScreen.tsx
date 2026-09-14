import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { colors, spacing, typography } from '@/design/tokens';
import { selectTimeline } from '@/domain/selectors';
import { useKin } from '@/state/useKin';
import { MomentCard } from './MomentCard';

interface TimelineScreenProps {
  spaceId: string;
  onBack: () => void;
  onOpenMemory: (memoryId: string) => void;
}

export function TimelineScreen({ onBack, onOpenMemory, spaceId }: TimelineScreenProps) {
  const kin = useKin();
  if (kin.status === 'loading') return <ScreenState message="Opening your shared history…" title="Our timeline" />;
  const snapshot = kin.snapshot;
  const userId = snapshot?.currentUserId;
  const space = snapshot?.spaces.find((item) => item.id === spaceId);
  if (!snapshot || !userId || !space) return <ScreenState message="This timeline is not available." title="Our timeline" />;
  const memories = selectTimeline(snapshot.memories.filter((memory) => memory.spaceId === spaceId));
  const otherMember = snapshot.members.find((member) => member.spaceId === spaceId && member.userId !== userId);
  const other = snapshot.profiles.find((profile) => profile.id === otherMember?.userId);
  const name = space.preferencesByUser[userId]?.nickname || other?.displayName || 'your person';
  let previousYear = '';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to relationship" accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>WITH {name.toUpperCase()}</Text>
          <Text accessibilityRole="header" style={styles.title}>Our timeline</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View testID="timeline-list">
          {memories.length === 0 ? <Text style={styles.empty}>The first thing you keep will begin this timeline.</Text> : memories.map((memory) => {
            const year = memory.occurredOn.slice(0, 4);
            const showYear = year !== previousYear;
            previousYear = year;
            const source = snapshot.messages.find((message) => memory.sourceMessageIds.includes(message.id));
            return (
              <View key={memory.id} testID={`timeline-item-${memory.id}`}>
                {showYear ? <Text accessibilityRole="header" style={styles.year}>{year}</Text> : null}
                <MomentCard memory={memory} onOpen={onOpenMemory} sourceExcerpt={source?.body} />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  backText: { color: colors.plumInk, fontSize: 36, lineHeight: 38 },
  content: { alignSelf: 'center', maxWidth: 620, padding: spacing.xl, paddingBottom: 72, width: '100%' },
  empty: { color: colors.mutedInk, fontSize: 15, lineHeight: 22 },
  eyebrow: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  header: { alignItems: 'center', borderBottomColor: colors.keyline, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headingCopy: { flex: 1, marginLeft: spacing.sm },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  year: { color: colors.plumInk, fontSize: 29, fontWeight: '800', letterSpacing: -0.7, marginTop: spacing.xl },
});
