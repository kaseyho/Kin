import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/design/tokens';
import { selectOnThisDay } from '@/domain/selectors';
import { useKin } from '@/state/useKin';
import { MomentCard } from './MomentCard';
import { OnThisDayCard } from './OnThisDayCard';

interface MomentsFeedScreenProps {
  today?: `${number}-${number}-${number}`;
  onOpenMemory: (memoryId: string) => void;
}

export function MomentsFeedScreen({
  onOpenMemory,
  today = new Date().toISOString().slice(0, 10) as `${number}-${number}-${number}`,
}: MomentsFeedScreenProps) {
  const kin = useKin();
  const snapshot = kin.snapshot;
  const onThisDay = snapshot ? selectOnThisDay(snapshot.memories, today)[0] : undefined;
  const recent = snapshot ? [...snapshot.memories].sort((left, right) => right.occurredOn.localeCompare(left.occurredOn)) : [];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark}>kin</Text>
        <Text accessibilityRole="header" style={styles.title}>Moments</Text>
        <Text style={styles.intro}>The parts of your conversations worth keeping.</Text>
        {onThisDay ? (
          <View style={styles.section}>
            <OnThisDayCard memory={onThisDay} onOpen={onOpenMemory} partnerName={partnerName(snapshot, onThisDay.spaceId)} />
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>YOUR TIMELINE</Text>
          {recent.length ? recent.map((memory) => {
            const source = snapshot?.messages.find((message) => memory.sourceMessageIds.includes(message.id));
            return <MomentCard key={memory.id} memory={memory} onOpen={onOpenMemory} sourceExcerpt={source?.body} />;
          }) : <Text style={styles.empty}>Long-press a message and choose Remember this to begin.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function partnerName(snapshot: ReturnType<typeof useKin>['snapshot'], spaceId: string): string {
  const userId = snapshot?.currentUserId;
  const space = snapshot?.spaces.find((item) => item.id === spaceId);
  const otherMember = snapshot?.members.find((member) => member.spaceId === spaceId && member.userId !== userId);
  const other = snapshot?.profiles.find((profile) => profile.id === otherMember?.userId);
  return userId ? space?.preferencesByUser[userId]?.nickname || other?.displayName || 'your person' : 'your person';
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', maxWidth: 680, padding: spacing.xl, paddingBottom: 110, width: '100%' },
  empty: { color: colors.mutedInk, fontSize: 14, lineHeight: 21, marginTop: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  intro: { color: colors.mutedInk, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  section: { marginTop: spacing.xxl },
  title: { color: colors.plumInk, fontSize: 38, fontWeight: '800', letterSpacing: -1.2 },
  wordmark: { color: colors.rose, fontSize: 15, fontWeight: '900' },
});
