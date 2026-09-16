import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { AuthError } from '@/services/auth/contracts';
import { useAuth } from '@/state/useAuth';

interface AccountActionsProps {
  mode: 'connected' | 'demo';
  onDelete?: () => void;
  onExport?: () => void;
  onResetDemo: () => Promise<void>;
  onSignedOut: () => void;
}

export function AccountActions({
  mode,
  onDelete,
  onExport,
  onResetDemo,
  onSignedOut,
}: AccountActionsProps) {
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isDemo = mode === 'demo';

  function openConfirmation() {
    setError('');
    setConfirming(true);
  }

  function closeConfirmation() {
    if (busy) return;
    setConfirming(false);
    setError('');
  }

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      if (isDemo) await onResetDemo();
      else await auth.signOut();
      setConfirming(false);
      onSignedOut();
    } catch (reason) {
      setError(
        reason instanceof AuthError
          ? reason.message
          : isDemo
            ? 'Kin could not reset the demo. Try again.'
            : 'Kin could not sign you out. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const actionLabel = isDemo ? 'Reset demo' : 'Sign out';
  const confirmLabel = isDemo ? 'Reset demo now' : 'Sign out now';

  return (
    <View style={styles.section}>
      <Text style={styles.label}>ACCOUNT</Text>
      {onExport ? <ActionRow label="Export my data" onPress={onExport} /> : null}
      {onDelete ? <ActionRow destructive label="Delete account" onPress={onDelete} /> : null}
      <ActionRow label={actionLabel} onPress={openConfirmation} />

      <AccessibleSheet
        closeLabel={`Close ${actionLabel.toLowerCase()} confirmation`}
        label={`${actionLabel} confirmation`}
        onClose={closeConfirmation}
        visible={confirming}
      >
        <Text style={styles.sheetEyebrow}>{isDemo ? 'DEMO CONTROLS' : 'YOUR ACCOUNT'}</Text>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{actionLabel}?</Text>
        <Text style={styles.sheetCopy}>
          {isDemo
            ? 'This restores Maya and Jamie’s original demo story on this device.'
            : 'Your private data stays in Kin. Sign back in with this email whenever you want to return.'}
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityLabel={isDemo ? 'Keep current demo' : 'Keep me signed in'}
            accessibilityRole="button"
            disabled={busy}
            onPress={closeConfirmation}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonLabel}>
              {isDemo ? 'Keep current demo' : 'Keep me signed in'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={busy ? 'Working…' : confirmLabel}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void confirm()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>{busy ? 'Working…' : confirmLabel}</Text>
          </Pressable>
        </View>
      </AccessibleSheet>
    </View>
  );
}

function ActionRow({
  destructive = false,
  label,
  onPress,
}: {
  destructive?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chevron: { color: colors.mutedInk, fontSize: 24 },
  destructive: { color: colors.danger },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: spacing.md },
  label: { color: colors.rose, fontFamily: typography.label, fontSize: 11, letterSpacing: 1.2 },
  pressed: { opacity: 0.68 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  primaryButtonLabel: { color: colors.paper, fontFamily: typography.label, fontSize: 13, textAlign: 'center' },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.keyline,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
  },
  rowLabel: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 15 },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.keyline,
    borderRadius: radii.round,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonLabel: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 13, textAlign: 'center' },
  section: { borderTopColor: colors.keyline, borderTopWidth: 1, marginTop: spacing.xxl, paddingTop: spacing.xl },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  sheetCopy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 15, lineHeight: 23, marginTop: spacing.sm },
  sheetEyebrow: { color: colors.rose, fontFamily: typography.label, fontSize: 11, letterSpacing: 1.2 },
  sheetTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 28, marginTop: spacing.xs },
});
