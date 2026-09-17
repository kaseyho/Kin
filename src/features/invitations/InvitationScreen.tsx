import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { StorageAdapter } from '@/data/contracts';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { useKin } from '@/state/useKin';

import { createInviteUrl, normalizeInviteCode } from './inviteLinks';
import {
  invitationActions,
  type InvitationActions,
  type InvitationShareResult,
} from './invitationActions';
import { clearPendingInvite, savePendingInvite } from './pendingInvite';

export type { InvitationActions } from './invitationActions';

type InvitationAuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'demo';

interface InvitationScreenProps {
  actions?: InvitationActions;
  authStatus: InvitationAuthStatus;
  hostSpaceId?: string;
  inviteCode: string;
  onAuthenticationRequired: () => void;
  onDismiss: () => void;
  onInvitationChanged?: (inviteCode: string) => void;
  onProfileRequired: () => void;
  onSpaceReady: (spaceId: string) => void;
  publicAppUrl: string;
  storage: StorageAdapter;
}

export function InvitationScreen({
  actions = invitationActions,
  authStatus,
  hostSpaceId: initialHostSpaceId,
  inviteCode,
  onAuthenticationRequired,
  onDismiss,
  onInvitationChanged,
  onProfileRequired,
  onSpaceReady,
  publicAppUrl,
  storage,
}: InvitationScreenProps) {
  const kin = useKin();
  const code = useMemo(() => normalizeInviteCode(inviteCode), [inviteCode]);
  const [hostedSpaceId, setHostedSpaceId] = useState<string | null>(initialHostSpaceId ?? null);
  const [attemptRevision, setAttemptRevision] = useState(0);
  const [handoffRevision, setHandoffRevision] = useState(0);
  const [redeeming, setRedeeming] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [busyAction, setBusyAction] = useState<'copy' | 'share' | 'rotate' | 'revoke' | null>(null);
  const [error, setError] = useState('');
  const [handoffError, setHandoffError] = useState('');
  const [cleanupSpaceId, setCleanupSpaceId] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState('');
  const [closedByAction, setClosedByAction] = useState(false);
  const [feedback, setFeedback] = useState('');
  const handledTransition = useRef<string | null>(null);
  const attemptedRedemption = useRef<string | null>(null);

  const currentUserId = kin.snapshot?.currentUserId ?? null;
  const hostedSpace = hostedSpaceId
    ? kin.snapshot?.spaces.find((space) => space.id === hostedSpaceId)
    : undefined;
  const hostedMembers = hostedSpaceId
    ? kin.snapshot?.members.filter((member) => member.spaceId === hostedSpaceId) ?? []
    : [];
  const connected = hostedMembers.length >= 2;
  const activeInvitation = hostedSpace?.activeInvitation;
  const invitationExpired = activeInvitation?.status === 'expired';
  const shareableInvitation = activeInvitation?.status === 'active' && !invitationExpired
    ? activeInvitation
    : undefined;
  const partnerName = hostedSpace && currentUserId
    ? hostedSpace.preferencesByUser[currentUserId]?.nickname || 'Your person'
    : 'Your person';

  useEffect(() => {
    if (authStatus === 'loading' || hostedSpaceId || !code) return;

    if (authStatus === 'signed-out') {
      const transitionKey = `auth:${code}:${handoffRevision}`;
      if (handledTransition.current === transitionKey) return;
      handledTransition.current = transitionKey;
      void savePendingInvite(storage, code)
        .then(onAuthenticationRequired)
        .catch(() => {
          setHandoffError('Kin could not keep this invitation on this device. Try again.');
        });
      return;
    }

    if (kin.status !== 'ready' || !kin.snapshot) return;
    const hasProfile = !!currentUserId && kin.snapshot.profiles.some(
      (profile) => profile.id === currentUserId,
    );
    if (!hasProfile) {
      const transitionKey = `profile:${code}:${handoffRevision}`;
      if (handledTransition.current === transitionKey) return;
      handledTransition.current = transitionKey;
      void savePendingInvite(storage, code)
        .then(onProfileRequired)
        .catch(() => {
          setHandoffError('Kin could not keep this invitation on this device. Try again.');
        });
      return;
    }

    const ownedSpace = kin.snapshot.spaces.find((space) =>
      space.activeInvitation?.code === code
      && kin.snapshot?.members.some(
        (member) => member.spaceId === space.id && member.userId === currentUserId,
      ));
    if (ownedSpace) {
      void clearPendingInvite(storage)
        .then(() => setHostedSpaceId(ownedSpace.id))
        .catch(() => {
          setCleanupSpaceId(ownedSpace.id);
          setCleanupError(
            'Your Space is ready, but Kin could not finish clearing the invitation from this device.',
          );
        });
      return;
    }

    const attemptKey = `${code}:${attemptRevision}`;
    if (attemptedRedemption.current === attemptKey) return;
    attemptedRedemption.current = attemptKey;
    void Promise.resolve()
      .then(() => {
        setRedeeming(true);
        setError('');
        setFeedback('');
      })
      .then(() => savePendingInvite(storage, code).catch(() => undefined))
      .then(() => kin.joinSpace({ inviteCode: code }))
      .then(async (space) => {
        try {
          await clearPendingInvite(storage);
          onSpaceReady(space.id);
        } catch {
          setCleanupSpaceId(space.id);
          setCleanupError(
            'Your Space is connected, but Kin could not finish clearing the invitation from this device.',
          );
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Kin could not use that invitation.');
      })
      .finally(() => setRedeeming(false));
  }, [
    attemptRevision,
    authStatus,
    code,
    currentUserId,
    handoffRevision,
    hostedSpaceId,
    kin,
    onAuthenticationRequired,
    onProfileRequired,
    onSpaceReady,
    storage,
  ]);

  async function dismiss() {
    setDismissing(true);
    try {
      await clearPendingInvite(storage);
      onDismiss();
    } catch {
      setError('Kin could not clear this invitation from this device. Try leaving again.');
    } finally {
      setDismissing(false);
    }
  }

  async function finishCleanup() {
    if (!cleanupSpaceId) return;
    setRedeeming(true);
    setCleanupError('');
    try {
      await clearPendingInvite(storage);
      onSpaceReady(cleanupSpaceId);
    } catch {
      setCleanupError('Kin still could not clear the invitation. Check device storage and try again.');
    } finally {
      setRedeeming(false);
    }
  }

  async function copyInvitation(url: string) {
    setBusyAction('copy');
    setError('');
    setFeedback('');
    try {
      const copied = await actions.copy(url);
      if (!copied) throw new Error('copy unavailable');
      setFeedback('Link copied.');
    } catch {
      setError('Kin could not copy the link. You can still share the code shown here.');
    } finally {
      setBusyAction(null);
    }
  }

  async function shareInvitation(url: string) {
    setBusyAction('share');
    setError('');
    setFeedback('');
    try {
      const result: InvitationShareResult = await actions.share(url);
      if (result === 'shared') setFeedback('Invitation shared.');
      if (result === 'copied') setFeedback('Sharing was unavailable, so Kin copied the link.');
    } catch {
      setError('Kin could not open sharing. Copy the invitation link instead.');
    } finally {
      setBusyAction(null);
    }
  }

  async function rotateInvitation() {
    if (!hostedSpaceId) return;
    setBusyAction('rotate');
    setError('');
    setFeedback('');
    try {
      const invitation = await kin.rotateSpaceInvite({ spaceId: hostedSpaceId });
      setClosedByAction(false);
      onInvitationChanged?.(invitation.code);
      setFeedback('New invitation ready. The old code no longer works.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not replace the invitation.');
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeInvitation() {
    if (!hostedSpaceId) return;
    setBusyAction('revoke');
    setError('');
    setFeedback('');
    try {
      await kin.revokeSpaceInvite({ spaceId: hostedSpaceId });
      setClosedByAction(true);
      setFeedback('The invitation can no longer be used.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not cancel the invitation.');
    } finally {
      setBusyAction(null);
    }
  }

  if (hostedSpaceId && kin.status !== 'ready') {
    return (
      <InvitationLayout eyebrow="PRIVATE INVITATION" title="Opening your invitation…">
        <View accessibilityLabel="Opening invitation" style={styles.loadingWrap}>
          <ActivityIndicator color={colors.rose} />
        </View>
      </InvitationLayout>
    );
  }

  if (hostedSpaceId && kin.status === 'ready' && !hostedSpace) {
    return (
      <InvitationLayout eyebrow="INVITATION" title="This Kin Space is unavailable.">
        <Text style={styles.copy}>It may have been left, blocked, or removed.</Text>
        <PrimaryButton label="Back to Chats" onPress={onDismiss} />
      </InvitationLayout>
    );
  }

  if (hostedSpace && connected) {
    return (
      <InvitationLayout eyebrow="YOU’RE CONNECTED" title={`${partnerName} is here.`}>
        <Text style={styles.copy}>
          This single-use invitation is closed. Your private Space is ready for the two of you.
        </Text>
        <PrimaryButton label="Open our Kin Space" onPress={() => onSpaceReady(hostedSpace.id)} />
      </InvitationLayout>
    );
  }

  if (hostedSpace && !shareableInvitation) {
    return (
      <InvitationLayout
        eyebrow="INVITATION CLOSED"
        title={closedByAction
          ? 'Invitation cancelled.'
          : invitationExpired
            ? 'Invitation expired.'
            : 'No active invitation.'}
      >
        <Text style={styles.copy}>
          The previous code no longer works. Create a new one whenever you are ready.
        </Text>
        <InlineNotice error={error} feedback={feedback} />
        <PrimaryButton
          disabled={busyAction !== null}
          label={busyAction === 'rotate' ? 'Creating…' : 'Create a new invitation'}
          onPress={() => void rotateInvitation()}
        />
        <SecondaryButton label="Back to Chats" onPress={onDismiss} />
      </InvitationLayout>
    );
  }

  if (hostedSpace && shareableInvitation) {
    const url = createInviteUrl(publicAppUrl, shareableInvitation.code);
    return (
      <InvitationLayout eyebrow="PRIVATE · ONE USE" title={`${partnerName} is one tap away.`}>
        <Text style={styles.copy}>
          Send this only to {partnerName}. It closes as soon as they join, and you can replace it at any time.
        </Text>
        <View style={styles.inviteCard} testID="invitation-card">
          <Text style={styles.cardLabel}>INVITATION CODE</Text>
          <Text selectable style={styles.code}>{shareableInvitation.code}</Text>
          <Text selectable style={styles.link}>{url}</Text>
          <Text style={styles.expiry}>Valid until {formatExpiry(shareableInvitation.expiresAt)}</Text>
        </View>
        <InlineNotice error={error} feedback={feedback} />
        <PrimaryButton
          disabled={busyAction !== null}
          label={busyAction === 'share' ? 'Opening sharing…' : 'Share invitation'}
          onPress={() => void shareInvitation(url)}
        />
        <SecondaryButton
          disabled={busyAction !== null}
          label={busyAction === 'copy' ? 'Copying…' : 'Copy invitation link'}
          onPress={() => void copyInvitation(url)}
        />
        <View style={styles.manageRow}>
          <TextButton
            disabled={busyAction !== null}
            label="Replace invitation code"
            onPress={() => void rotateInvitation()}
          />
          <TextButton
            destructive
            disabled={busyAction !== null}
            label="Cancel invitation"
            onPress={() => void revokeInvitation()}
          />
        </View>
        <View style={styles.backRow}>
          <TextButton label="Back to Chats" onPress={onDismiss} />
        </View>
      </InvitationLayout>
    );
  }

  if (cleanupSpaceId) {
    return (
      <InvitationLayout eyebrow="CONNECTED" title="Your Kin Space is ready.">
        <Text style={styles.copy}>
          One last local cleanup step will prevent this single-use invitation from reopening.
        </Text>
        <InlineNotice error={cleanupError} feedback="" />
        <PrimaryButton
          disabled={redeeming}
          label={redeeming ? 'Finishing…' : 'Finish opening our Kin Space'}
          onPress={() => void finishCleanup()}
        />
      </InvitationLayout>
    );
  }

  if (!code) {
    return (
      <InvitationLayout eyebrow="INVITATION" title="This invitation link is not valid.">
        <Text style={styles.copy}>Ask the sender for a fresh Kin link or enter the code again.</Text>
        <InlineNotice error={error} feedback="" />
        <PrimaryButton
          disabled={dismissing}
          label={dismissing ? 'Leaving…' : 'Leave invitation'}
          onPress={() => void dismiss()}
        />
      </InvitationLayout>
    );
  }

  if (error) {
    return (
      <InvitationLayout eyebrow="INVITATION" title="This invitation needs attention.">
        <View style={styles.inviteCard} testID="invitation-card">
          <Text style={styles.cardLabel}>CODE</Text>
          <Text selectable style={styles.code}>{code}</Text>
        </View>
        <InlineNotice error={error} feedback="" />
        <PrimaryButton
          label="Try this invitation again"
          onPress={() => setAttemptRevision((value) => value + 1)}
        />
        <SecondaryButton
          disabled={dismissing}
          label={dismissing ? 'Leaving…' : 'Leave invitation'}
          onPress={() => void dismiss()}
        />
      </InvitationLayout>
    );
  }

  return (
    <InvitationLayout
      eyebrow="PRIVATE INVITATION"
      title={redeeming ? 'Joining your Kin Space…' : 'Keeping your invitation safe…'}
    >
      <View accessibilityLabel="Opening invitation" style={styles.loadingWrap}>
        <ActivityIndicator color={colors.rose} />
        <Text style={styles.copy}>
          {authStatus === 'signed-out'
            ? 'Sign in first. Kin will bring you straight back to this invitation.'
            : 'This code will be used once, only for the person it was sent to.'}
        </Text>
      </View>
      {handoffError ? <InlineNotice error={handoffError} feedback="" /> : null}
      {handoffError ? (
        <PrimaryButton
          label="Try saving this invitation again"
          onPress={() => {
            setHandoffError('');
            setHandoffRevision((value) => value + 1);
          }}
        />
      ) : null}
    </InvitationLayout>
  );
}

function InvitationLayout({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark}>kin</Text>
          <View style={styles.lockDot} />
          <Text style={styles.privateLabel}>private by design</Text>
        </View>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function InlineNotice({ error, feedback }: { error: string; feedback: string }) {
  if (!error && !feedback) return null;
  return (
    <Text accessibilityRole={error ? 'alert' : undefined} style={error ? styles.error : styles.feedback}>
      {error || feedback}
    </Text>
  );
}

function PrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

function TextButton({
  destructive = false,
  disabled = false,
  label,
  onPress,
}: {
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.textButtonLabel, destructive && styles.destructiveLabel]}>{label}</Text>
    </Pressable>
  );
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'the displayed expiry';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  backRow: { alignItems: 'center', marginTop: spacing.sm },
  cardLabel: { color: colors.rose, fontSize: 11, fontWeight: '800', letterSpacing: 1.25 },
  code: {
    color: colors.plumInk,
    fontFamily: typography.display,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: spacing.sm,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 640,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    width: '100%',
  },
  copy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 16, lineHeight: 24, marginBottom: spacing.xl },
  destructiveLabel: { color: colors.danger },
  disabled: { opacity: 0.48 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  expiry: { color: colors.mutedInk, fontSize: 12, marginTop: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 12, fontWeight: '800', letterSpacing: 1.35, marginBottom: spacing.md },
  feedback: { color: colors.success, fontSize: 14, fontWeight: '700', lineHeight: 21, marginBottom: spacing.lg },
  heading: { marginBottom: spacing.lg },
  inviteCard: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.xl,
  },
  link: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  loadingWrap: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  lockDot: { backgroundColor: colors.rose, borderRadius: 3, height: 6, marginLeft: spacing.sm, width: 6 },
  manageRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  pressed: { opacity: 0.72 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  primaryLabel: { color: colors.paper, fontSize: 16, fontWeight: '800' },
  privateLabel: { color: colors.mutedInk, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.keyline,
    borderRadius: radii.round,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.xl,
  },
  secondaryLabel: { color: colors.plumInk, fontSize: 15, fontWeight: '800' },
  textButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  textButtonLabel: { color: colors.plumInk, fontSize: 13, fontWeight: '800' },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 36, fontWeight: '700', letterSpacing: -1.1, lineHeight: 42 },
  wordmark: { color: colors.plumInk, fontFamily: typography.display, fontSize: 24, fontWeight: '700' },
  wordmarkRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 56 },
});
