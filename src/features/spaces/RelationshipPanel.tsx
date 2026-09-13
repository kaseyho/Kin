import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenState } from '@/components/ScreenState';
import {
  colors,
  radii,
  relationshipThemes,
  relationshipWallpapers,
  spacing,
} from '@/design/tokens';
import { selectOnThisDay, selectUpcoming } from '@/domain/selectors';
import { MomentCard } from '@/features/moments/MomentCard';
import { OnThisDayCard } from '@/features/moments/OnThisDayCard';
import { UpcomingList } from '@/features/moments/UpcomingList';
import { useKin } from '@/state/useKin';
import { usePremiumGate } from '@/features/premium/usePremiumGate';
import { PersonalizeSpaceSheet } from './PersonalizeSpaceSheet';
import { SpaceSafetyActions } from './SpaceSafetyActions';

interface RelationshipPanelProps {
  spaceId: string;
  today?: `${number}-${number}-${number}`;
  isKinPlus?: boolean;
  onBack?: () => void;
  onOpenKinPlus: () => void;
  onOpenMemory?: (memoryId: string) => void;
  onOpenTimeline: () => void;
  onSpaceUnavailable: () => void;
}

export function RelationshipPanel({
  isKinPlus,
  onBack,
  onOpenKinPlus,
  onOpenMemory = () => undefined,
  onOpenTimeline,
  onSpaceUnavailable,
  spaceId,
  today = new Date().toISOString().slice(0, 10) as `${number}-${number}-${number}`,
}: RelationshipPanelProps) {
  const kin = useKin();
  const premium = usePremiumGate();
  const [personalizing, setPersonalizing] = useState(false);

  if (kin.status === 'loading') {
    return <ScreenState message="Gathering what you have kept…" title="Your relationship" />;
  }
  const snapshot = kin.snapshot;
  const userId = snapshot?.currentUserId;
  const space = snapshot?.spaces.find((item) => item.id === spaceId);
  if (!snapshot || !userId || !space) {
    return <ScreenState message="This relationship may have been archived or removed." title="Kin Space not found" />;
  }

  const otherMember = snapshot.members.find(
    (member) => member.spaceId === spaceId && member.userId !== userId,
  );
  const partner = snapshot.profiles.find((profile) => profile.id === otherMember?.userId);
  const preference = space.preferencesByUser[userId];
  const partnerName = preference?.nickname || partner?.displayName || 'Your person';
  const theme = relationshipThemes.find((item) => item.id === preference?.themeId) ?? relationshipThemes[0];
  const wallpaper = relationshipWallpapers.find((item) => item.id === preference?.wallpaperId) ?? relationshipWallpapers[0];
  const memories = snapshot.memories.filter((memory) => memory.spaceId === spaceId);
  const onThisDay = selectOnThisDay(memories, today)[0];
  const upcoming = selectUpcoming(memories, today, 60).slice(0, 3);
  const recentMoments = memories
    .filter((memory) => memory.kind === 'moment')
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
    .slice(0, 3);
  const mediaCount = snapshot.messages.filter(
    (message) => message.spaceId === spaceId && message.kind === 'image',
  ).length;

  if (personalizing) {
    return (
      <PersonalizeSpaceSheet
        isKinPlus={isKinPlus ?? premium.entitlement.isKinPlus}
        onClose={() => setPersonalizing(false)}
        onRequestKinPlus={onOpenKinPlus}
        spaceId={spaceId}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.wallpaper }]}>
      <View style={styles.topBar}>
        {onBack ? (
          <Pressable accessibilityLabel="Back to conversation" accessibilityRole="button" onPress={onBack} style={styles.iconButton}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : <View style={styles.iconButton} />}
        <Text style={styles.wordmark}>kin</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View testID="relationship-sections">
          <View style={styles.identity} testID="relationship-identity">
            <Avatar accent={theme.accent} name={partner?.displayName ?? partnerName} size={82} />
            <Text accessibilityRole="header" style={styles.name}>{partnerName}</Text>
            <Text style={styles.since}>{relationshipSince(space.relationshipStartDate)}</Text>
            <View style={[styles.accentRule, { backgroundColor: theme.accent }]} />
          </View>

          {onThisDay ? (
            <View style={styles.editorialSection} testID="relationship-on-this-day">
              <OnThisDayCard memory={onThisDay} onOpen={onOpenMemory} partnerName={partnerName} />
            </View>
          ) : null}

          <View style={styles.section} testID="relationship-upcoming">
            <Text style={styles.eyebrow}>UPCOMING</Text>
            <UpcomingList items={upcoming} />
          </View>

          <View style={styles.section} testID="relationship-recent-moments">
            <Text style={styles.eyebrow}>RECENT MOMENTS</Text>
            {recentMoments.map((moment) => (
              <MomentCard
                key={moment.id}
                memory={moment}
                onOpen={onOpenMemory}
                sourceExcerpt={snapshot.messages.find((message) => moment.sourceMessageIds.includes(message.id))?.body}
              />
            ))}
          </View>

          <View style={styles.section} testID="relationship-timeline">
            <Pressable accessibilityLabel="Open full timeline" accessibilityRole="button" onPress={onOpenTimeline} style={styles.primaryAction}>
              <View>
                <Text style={styles.primaryTitle}>Our timeline</Text>
                <Text style={styles.primaryCopy}>See what you have kept, in order.</Text>
              </View>
              <Text style={styles.arrow}>↗</Text>
            </Pressable>
          </View>

          <View style={styles.section} testID="relationship-media-stickers">
            <Text style={styles.eyebrow}>OURS TO SHARE</Text>
            <Text style={styles.rowTitle}>Media & stickers</Text>
            <Text style={styles.copy}>{mediaCount} shared photo{mediaCount === 1 ? '' : 's'} · {space.stickerIds.length} relationship sticker{space.stickerIds.length === 1 ? '' : 's'}</Text>
          </View>

          <View style={styles.section} testID="relationship-personalization">
            <Text style={styles.eyebrow}>MAKE IT YOURS</Text>
            <Pressable accessibilityLabel="Personalize this Kin Space" accessibilityRole="button" onPress={() => setPersonalizing(true)} style={styles.secondaryAction}>
              <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
              <View style={styles.listCopy}>
                <Text style={styles.rowTitle}>Personalize this Space</Text>
                <Text style={styles.meta}>{theme.name} · {wallpaper.name}</Text>
              </View>
              <Text style={styles.smallArrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.section} testID="relationship-kin-plus">
            <Pressable accessibilityLabel="Open Kin+" accessibilityRole="button" onPress={onOpenKinPlus} style={styles.kinPlus}>
              <Text style={styles.kinPlusMark}>KIN+</Text>
              <Text style={styles.kinPlusTitle}>More ways to make this feel like yours.</Text>
              <Text style={styles.kinPlusCopy}>Relationship themes and room for every new Moment.</Text>
            </Pressable>
          </View>

          <View style={styles.section} testID="relationship-safety">
            <SpaceSafetyActions onSpaceUnavailable={onSpaceUnavailable} spaceId={spaceId} userId={userId} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function relationshipSince(start?: string): string {
  return start ? `Our story since ${formatLongDate(start)}` : 'A private space for the two of you';
}

function formatLongDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

const styles = StyleSheet.create({
  accentRule: { borderRadius: 2, height: 3, marginTop: spacing.lg, width: 54 },
  arrow: { color: colors.paper, fontSize: 28 },
  backGlyph: { color: colors.plumInk, fontSize: 36, lineHeight: 38 },
  content: { alignSelf: 'center', maxWidth: 680, paddingBottom: 72, width: '100%' },
  copy: { color: colors.mutedInk, fontSize: 14, lineHeight: 21, marginTop: spacing.xs },
  editorialSection: { backgroundColor: colors.paper, borderBottomColor: colors.keyline, borderBottomWidth: 1, borderTopColor: colors.keyline, borderTopWidth: 1, padding: spacing.xl },
  eyebrow: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.25 },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  identity: { alignItems: 'center', padding: spacing.xl, paddingBottom: spacing.xxl },
  kinPlus: { backgroundColor: colors.plumInk, borderRadius: radii.lg, padding: spacing.xl },
  kinPlusCopy: { color: '#D9CDD3', fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  kinPlusMark: { color: '#E8A6B9', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  kinPlusTitle: { color: colors.paper, fontSize: 20, fontWeight: '800', lineHeight: 26, marginTop: spacing.md },
  listCopy: { flex: 1 },
  meta: { color: colors.mutedInk, fontSize: 11, marginTop: spacing.xs },
  name: { color: colors.plumInk, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: spacing.md },
  primaryAction: { alignItems: 'center', backgroundColor: colors.rose, borderRadius: radii.lg, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg },
  primaryCopy: { color: '#F7DBE3', fontSize: 12, marginTop: spacing.xs },
  primaryTitle: { color: colors.paper, fontSize: 18, fontWeight: '800' },
  rowTitle: { color: colors.plumInk, fontSize: 15, fontWeight: '800' },
  screen: { flex: 1 },
  secondaryAction: { alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, minHeight: 68, padding: spacing.md },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  since: { color: colors.mutedInk, fontSize: 12, marginTop: spacing.xs },
  smallArrow: { color: colors.mutedInk, fontSize: 26 },
  themeDot: { borderRadius: 12, height: 24, width: 24 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  wordmark: { color: colors.rose, fontSize: 16, fontWeight: '900' },
});
