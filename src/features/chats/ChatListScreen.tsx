import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenState } from '@/components/ScreenState';
import { colors, radii, relationshipThemes, spacing, typography } from '@/design/tokens';
import type { KinSpace, Message, UserProfile } from '@/domain/models';
import { useKin } from '@/state/useKin';

interface ChatListScreenProps {
  onNewSpace: () => void;
  onOpenSpace: (spaceId: string) => void;
}

export function ChatListScreen({ onNewSpace, onOpenSpace }: ChatListScreenProps) {
  const kin = useKin();
  if (kin.status === 'loading') {
    return <ScreenState message="Bringing your people close…" title="Opening Kin" />;
  }
  if (kin.status === 'corrupt') {
    return (
      <ScreenState
        actionLabel="Reset the demo safely"
        message="Your saved demo could not be read. Kin will not overwrite it without asking."
        onAction={() => void kin.resetDemo()}
        title="This copy needs a fresh start"
      />
    );
  }
  if (!kin.snapshot?.currentUserId) {
    return <ScreenState message="Create your profile to begin." title="Kin is ready for you" />;
  }

  const userId = kin.snapshot.currentUserId;
  const spaces = kin.snapshot.spaces.filter(
    (space) =>
      !space.archivedByUserIds.includes(userId) &&
      kin.snapshot?.members.some((member) => member.spaceId === space.id && member.userId === userId),
  ).sort((left, right) => {
    const leftLatest = latestActivityAt(kin.snapshot!, left);
    const rightLatest = latestActivityAt(kin.snapshot!, right);
    return rightLatest.localeCompare(leftLatest);
  });

  if (spaces.length === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header />
        <View style={styles.emptyWrap}>
          <ScreenState
            actionLabel="Create your first Kin Space"
            eyebrow="YOUR CLOSEST PEOPLE"
            message="Start with one person. Give the relationship a place that grows with you."
            onAction={onNewSpace}
            title="A space for the people who matter."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Header />
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.sectionLabel}>YOUR KIN SPACES</Text>
        {spaces.map((space) => {
          const relationship = getRelationship(kin.snapshot!, space, userId);
          return (
            <ChatRow
              key={space.id}
              latestMessage={relationship.latestMessage}
              name={relationship.name}
              onPress={() => onOpenSpace(space.id)}
              profile={relationship.profile}
              space={space}
              unreadCount={kin.snapshot!.unreadCounts[space.id] ?? 0}
            />
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityLabel="New Kin Space"
        accessibilityRole="button"
        onPress={onNewSpace}
        style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
      >
        <Text style={styles.newButtonGlyph}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.wordmark}>kin</Text>
        <Text accessibilityRole="header" style={styles.title}>Chats</Text>
      </View>
      <Text style={styles.headerNote}>for the people who matter</Text>
    </View>
  );
}

function ChatRow({
  latestMessage,
  name,
  onPress,
  profile,
  space,
  unreadCount,
}: {
  latestMessage?: Message;
  name: string;
  onPress: () => void;
  profile?: UserProfile;
  space: KinSpace;
  unreadCount: number;
}) {
  const preference = Object.values(space.preferencesByUser).find((item) => item.nickname === name);
  const theme = relationshipThemes.find((item) => item.id === preference?.themeId) ?? relationshipThemes[0];
  return (
    <Pressable
      accessibilityHint={unreadCount > 0 ? formatUnreadLabel(unreadCount) : undefined}
      accessibilityLabel={`Open Kin Space with ${name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Avatar accent={theme.accent} name={profile?.displayName ?? name} size={54} uri={profile?.avatarUri} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.rowName}>{name}</Text>
          <Text style={styles.time}>{latestMessage ? formatTime(latestMessage.createdAt) : 'NEW'}</Text>
        </View>
        <Text numberOfLines={1} style={styles.preview}>{latestMessage?.body || 'Your Space is ready.'}</Text>
      </View>
      {unreadCount > 0 ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
      <View style={[styles.accentLine, { backgroundColor: theme.accent }]} />
    </Pressable>
  );
}

function getRelationship(snapshot: NonNullable<ReturnType<typeof useKin>['snapshot']>, space: KinSpace, userId: string) {
  const otherMember = snapshot.members.find(
    (member) => member.spaceId === space.id && member.userId !== userId,
  );
  const profile = snapshot.profiles.find((item) => item.id === otherMember?.userId);
  const name = space.preferencesByUser[userId]?.nickname || profile?.displayName || 'Your person';
  const latestMessage = snapshot.messages
    .filter((message) => message.spaceId === space.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  return { latestMessage, name, profile };
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

function latestActivityAt(
  snapshot: NonNullable<ReturnType<typeof useKin>['snapshot']>,
  space: KinSpace,
): string {
  return snapshot.messages
    .filter((message) => message.spaceId === space.id)
    .reduce((latest, message) => message.createdAt > latest ? message.createdAt : latest, space.createdAt);
}

function formatUnreadLabel(count: number): string {
  return count > 99 ? '99 or more unread messages' : `${count} unread ${count === 1 ? 'message' : 'messages'}`;
}

const styles = StyleSheet.create({
  accentLine: { borderRadius: radii.round, height: 28, width: 3 },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  header: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  headerNote: { color: colors.mutedInk, fontSize: 11, letterSpacing: 0.4, marginBottom: 6 },
  list: { gap: spacing.md, padding: spacing.xl, paddingBottom: 110 },
  newButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: 27,
    bottom: spacing.xl,
    height: 54,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xl,
    width: 54,
  },
  newButtonGlyph: { color: colors.paper, fontSize: 28, fontWeight: '300', lineHeight: 31 },
  pressed: { opacity: 0.72 },
  preview: { color: colors.mutedInk, fontSize: 14, marginTop: 5 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 84,
    padding: spacing.md,
  },
  rowBody: { flex: 1 },
  rowName: { color: colors.plumInk, flex: 1, fontFamily: typography.bodyStrong, fontSize: 17, fontWeight: '800' },
  rowPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  rowTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  sectionLabel: { color: colors.rose, fontSize: 11, fontWeight: '800', letterSpacing: 1.25 },
  time: { color: colors.mutedInk, fontSize: 11 },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 38, fontWeight: '800', letterSpacing: -1.2 },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.rose,
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 7,
  },
  unreadText: { color: colors.paper, fontSize: 11, fontWeight: '800' },
  wordmark: { color: colors.rose, fontFamily: typography.display, fontSize: 15, fontWeight: '900', letterSpacing: -0.5 },
});
