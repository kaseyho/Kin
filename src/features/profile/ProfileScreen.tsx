import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography } from '@/design/tokens';
import { usePremiumGate } from '@/features/premium/usePremiumGate';
import { useAuth } from '@/state/useAuth';
import { useKin } from '@/state/useKin';
import { AccountActions } from './AccountActions';
import { EditProfileSheet } from './EditProfileSheet';

interface ProfileScreenProps {
  onOpenKinPlus: () => void;
  onSignedOut: () => void;
}

export function ProfileScreen({ onOpenKinPlus, onSignedOut }: ProfileScreenProps) {
  const auth = useAuth();
  const kin = useKin();
  const premium = usePremiumGate();
  const [editing, setEditing] = useState(false);
  const snapshot = kin.snapshot;
  const userId = snapshot?.currentUserId;
  const profile = snapshot?.profiles.find((item) => item.id === userId);
  const archived = snapshot?.spaces.filter((space) => userId && space.archivedByUserIds.includes(userId)) ?? [];
  const accountEmail = auth.state.status === 'signed-in' ? auth.state.user.email : undefined;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark}>kin</Text>
        <Text accessibilityRole="header" style={styles.title}>Profile</Text>
        <View style={styles.identityRow}>
          <Text style={styles.name}>{profile?.displayName ?? 'Your profile'}</Text>
          {profile ? (
            <Pressable
              accessibilityLabel="Edit profile"
              accessibilityRole="button"
              onPress={() => setEditing(true)}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            >
              <Text style={styles.editButtonLabel}>Edit profile</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable accessibilityLabel="Open Kin+" accessibilityRole="button" onPress={onOpenKinPlus} style={styles.plus}>
          <Text style={styles.plusMark}>KIN+</Text>
          <Text style={styles.plusTitle}>Expression for your closest relationships.</Text>
          <Text style={styles.plusStatus}>
            {premium.entitlement.isKinPlus
              ? premium.entitlement.source === 'demo' ? 'Demo entitlement active' : 'Kin+ active'
              : 'See themes and unlimited Moments'}
          </Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.label}>PRIVACY</Text>
          <Text style={styles.sectionTitle}>Private by default</Text>
          <Text style={styles.copy}>Remembered items start private to you. Kin has no public profile, relationship score, advertising, or silent relationship analysis.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>ARCHIVED KIN SPACES</Text>
          {archived.length === 0 ? <Text style={styles.copy}>No archived Spaces.</Text> : archived.map((space) => {
            const other = snapshot?.members.find((member) => member.spaceId === space.id && member.userId !== userId);
            const person = snapshot?.profiles.find((item) => item.id === other?.userId);
            const name = userId ? space.preferencesByUser[userId]?.nickname || person?.displayName || 'Your person' : 'Your person';
            return (
              <Pressable
                accessibilityLabel={`Restore Kin Space with ${name}`}
                accessibilityRole="button"
                key={space.id}
                onPress={() => userId ? kin.archiveSpace(space.id, userId, false) : undefined}
                style={styles.restore}
              >
                <Text style={styles.restoreName}>{name}</Text>
                <Text style={styles.restoreAction}>Restore</Text>
              </Pressable>
            );
          })}
        </View>

        <AccountActions
          accountEmail={accountEmail}
          mode={kin.mode}
          onDelete={accountEmail ? () => auth.accountService.deleteAccount() : undefined}
          onExport={accountEmail ? () => auth.accountService.exportData() : undefined}
          onRequestFreshOtp={accountEmail
            ? (email) => auth.accountService.requestFreshOtp(email)
            : undefined}
          onResetDemo={kin.resetDemo}
          onSignedOut={onSignedOut}
          onVerifyFreshOtp={accountEmail
            ? (email, token) => auth.accountService.verifyFreshOtp(email, token)
            : undefined}
        />
      </ScrollView>
      {editing && profile ? (
        <EditProfileSheet
          onClose={() => setEditing(false)}
          profile={profile}
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: 100 },
  copy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  editButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  editButtonLabel: { color: colors.rose, fontFamily: typography.bodyStrong, fontSize: 13 },
  identityRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  name: { color: colors.mutedInk, fontSize: 15, marginTop: spacing.xs },
  plus: { backgroundColor: colors.plumInk, borderRadius: radii.lg, marginTop: spacing.xl, padding: spacing.xl },
  plusMark: { color: '#E8A6B9', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  plusTitle: { color: colors.paper, fontSize: 20, fontWeight: '800', lineHeight: 26, marginTop: spacing.md },
  plusStatus: { color: '#D9CDD3', fontSize: 12, marginTop: spacing.sm },
  pressed: { opacity: 0.68 },
  restore: { alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, minHeight: 54, paddingHorizontal: spacing.md },
  restoreAction: { color: colors.rose, fontSize: 13, fontWeight: '800' },
  restoreName: { color: colors.plumInk, fontSize: 15, fontWeight: '800' },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  section: { borderTopColor: colors.keyline, borderTopWidth: 1, marginTop: spacing.xxl, paddingTop: spacing.xl },
  sectionTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 19, fontWeight: '800', marginTop: spacing.sm },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 38, fontWeight: '800', letterSpacing: -1.2 },
  wordmark: { color: colors.rose, fontFamily: typography.display, fontSize: 15, fontWeight: '900' },
});
