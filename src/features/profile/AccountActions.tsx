import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { AccountError, type AccountExport } from '@/services/account/contracts';
import { presentAccountExport } from '@/services/account/presentExport';
import { AuthError } from '@/services/auth/contracts';
import { useAuth } from '@/state/useAuth';

interface AccountActionsProps {
  accountEmail?: string;
  mode: 'connected' | 'demo';
  onDelete?: () => Promise<{ deleted: true }>;
  onExport?: () => Promise<AccountExport>;
  onPresentExport?: (data: AccountExport) => Promise<void>;
  onRequestFreshOtp?: (email: string) => Promise<void>;
  onResetDemo: () => Promise<void>;
  onSignedOut: () => void;
  onVerifyFreshOtp?: (email: string, token: string) => Promise<void>;
}

type DeleteStep = 'explain' | 'code' | 'confirm';

export function AccountActions({
  accountEmail,
  mode,
  onDelete,
  onExport,
  onPresentExport = presentAccountExport,
  onRequestFreshOtp,
  onResetDemo,
  onSignedOut,
  onVerifyFreshOtp,
}: AccountActionsProps) {
  const auth = useAuth();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const [exportError, setExportError] = useState('');
  const [deleteStep, setDeleteStep] = useState<DeleteStep | null>(null);
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const isDemo = mode === 'demo';
  const hasDeletion = Boolean(
    accountEmail && onDelete && onRequestFreshOtp && onVerifyFreshOtp,
  );

  function openSignOutConfirmation() {
    setSignOutError('');
    setConfirmingSignOut(true);
  }

  function closeSignOutConfirmation() {
    if (signOutBusy) return;
    setConfirmingSignOut(false);
    setSignOutError('');
  }

  async function confirmSignOut() {
    setSignOutBusy(true);
    setSignOutError('');
    try {
      if (isDemo) await onResetDemo();
      else await auth.signOut();
      setConfirmingSignOut(false);
      onSignedOut();
    } catch (reason) {
      setSignOutError(
        reason instanceof AuthError
          ? reason.message
          : isDemo
            ? 'Kin could not reset the demo. Try again.'
            : 'Kin could not sign you out. Try again.',
      );
    } finally {
      setSignOutBusy(false);
    }
  }

  async function exportData() {
    if (!onExport) return;
    setExporting(true);
    setExportError('');
    setExportNotice('');
    try {
      const data = await onExport();
      await onPresentExport(data);
      setExportNotice('Your Kin export is ready.');
    } catch (reason) {
      setExportError(
        reason instanceof AccountError
          ? reason.message
          : 'Kin could not export your data. Try again.',
      );
    } finally {
      setExporting(false);
    }
  }

  function openDelete() {
    setDeleteCode('');
    setDeleteConfirmation('');
    setDeleteError('');
    setDeleteStep('explain');
  }

  function closeDelete() {
    if (deleteBusy) return;
    setDeleteStep(null);
    setDeleteCode('');
    setDeleteConfirmation('');
    setDeleteError('');
  }

  async function requestDeletionCode() {
    if (!accountEmail || !onRequestFreshOtp) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await onRequestFreshOtp(accountEmail);
      setDeleteStep('code');
    } catch (reason) {
      setDeleteError(accountErrorMessage(reason, 'Kin could not send a deletion code. Try again.'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function verifyDeletionCode() {
    if (!accountEmail || !onVerifyFreshOtp) return;
    if (!/^\d{6}$/.test(deleteCode)) {
      setDeleteError('Enter the six-digit code.');
      return;
    }
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await onVerifyFreshOtp(accountEmail, deleteCode);
      setDeleteStep('confirm');
    } catch (reason) {
      setDeleteError(accountErrorMessage(reason, 'That code could not be verified. Request a new one.'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function deleteAccount() {
    if (!onDelete) return;
    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Type DELETE exactly to confirm account deletion.');
      return;
    }
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await onDelete();
      setDeleteStep(null);
      onSignedOut();
    } catch (reason) {
      setDeleteError(accountErrorMessage(reason, 'Kin could not delete your account. Try again.'));
    } finally {
      setDeleteBusy(false);
    }
  }

  const actionLabel = isDemo ? 'Reset demo' : 'Sign out';
  const confirmLabel = isDemo ? 'Reset demo now' : 'Sign out now';

  return (
    <View style={styles.section}>
      <Text style={styles.label}>ACCOUNT</Text>
      {onExport ? (
        <ActionRow
          disabled={exporting}
          label={exporting ? 'Preparing export…' : 'Export my data'}
          onPress={() => void exportData()}
        />
      ) : null}
      {exportNotice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{exportNotice}</Text> : null}
      {exportError ? <Text accessibilityRole="alert" style={styles.error}>{exportError}</Text> : null}
      {hasDeletion ? <ActionRow destructive label="Delete account" onPress={openDelete} /> : null}
      <ActionRow label={actionLabel} onPress={openSignOutConfirmation} />

      <AccessibleSheet
        closeLabel={`Close ${actionLabel.toLowerCase()} confirmation`}
        label={`${actionLabel} confirmation`}
        onClose={closeSignOutConfirmation}
        visible={confirmingSignOut}
      >
        <Text style={styles.sheetEyebrow}>{isDemo ? 'DEMO CONTROLS' : 'YOUR ACCOUNT'}</Text>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{actionLabel}?</Text>
        <Text style={styles.sheetCopy}>
          {isDemo
            ? 'This restores Maya and Jamie’s original demo story on this device.'
            : 'Your private data stays in Kin. Sign back in with this email whenever you want to return.'}
        </Text>
        {signOutError ? <Text accessibilityRole="alert" style={styles.error}>{signOutError}</Text> : null}
        <View style={styles.sheetActions}>
          <SecondaryButton
            disabled={signOutBusy}
            label={isDemo ? 'Keep current demo' : 'Keep me signed in'}
            onPress={closeSignOutConfirmation}
          />
          <PrimaryButton
            disabled={signOutBusy}
            label={signOutBusy ? 'Working…' : confirmLabel}
            onPress={() => void confirmSignOut()}
          />
        </View>
      </AccessibleSheet>

      <AccessibleSheet
        closeLabel="Close account deletion"
        label="Delete account"
        onClose={closeDelete}
        visible={deleteStep !== null}
      >
        <Text style={styles.sheetEyebrow}>PERMANENT ACCOUNT ACTION</Text>
        {deleteStep === 'explain' ? (
          <>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Delete your account?</Text>
            <Text style={styles.sheetCopy}>
              Your profile, messages, reactions, and Moments are removed. A remaining member keeps
              the Kin Space itself and their own content. This cannot be undone.
            </Text>
            <Text style={styles.emailCopy}>We’ll verify {accountEmail} before deletion.</Text>
          </>
        ) : null}
        {deleteStep === 'code' ? (
          <>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Check your email</Text>
            <Text style={styles.sheetCopy}>Enter the six-digit deletion code sent to {accountEmail}.</Text>
            <TextInput
              accessibilityLabel="Deletion code"
              autoFocus
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setDeleteCode(value.replace(/\D/g, ''))}
              placeholder="000000"
              placeholderTextColor={colors.mutedInk}
              style={[styles.input, styles.codeInput]}
              textContentType="oneTimeCode"
              value={deleteCode}
            />
          </>
        ) : null}
        {deleteStep === 'confirm' ? (
          <>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Final confirmation</Text>
            <Text style={styles.sheetCopy}>Type DELETE to permanently remove this Kin account.</Text>
            <TextInput
              accessibilityLabel="Type DELETE to confirm account deletion"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              editable={!deleteBusy}
              onChangeText={setDeleteConfirmation}
              placeholder="DELETE"
              placeholderTextColor={colors.mutedInk}
              style={styles.input}
              value={deleteConfirmation}
            />
          </>
        ) : null}
        {deleteError ? <Text accessibilityRole="alert" style={styles.error}>{deleteError}</Text> : null}
        <View style={styles.sheetActions}>
          <SecondaryButton disabled={deleteBusy} label="Cancel" onPress={closeDelete} />
          {deleteStep === 'explain' ? (
            <PrimaryButton
              destructive
              disabled={deleteBusy}
              label={deleteBusy ? 'Sending…' : 'Email a deletion code'}
              onPress={() => void requestDeletionCode()}
            />
          ) : null}
          {deleteStep === 'code' ? (
            <PrimaryButton
              destructive
              disabled={deleteBusy}
              label={deleteBusy ? 'Verifying…' : 'Verify deletion code'}
              onPress={() => void verifyDeletionCode()}
            />
          ) : null}
          {deleteStep === 'confirm' ? (
            <PrimaryButton
              destructive
              disabled={deleteBusy}
              label={deleteBusy ? 'Deleting…' : 'Delete my account'}
              onPress={() => void deleteAccount()}
            />
          ) : null}
        </View>
      </AccessibleSheet>
    </View>
  );
}

function accountErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof AccountError ? reason.message : fallback;
}

function ActionRow({
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
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function PrimaryButton({
  destructive = false,
  disabled,
  label,
  onPress,
}: {
  destructive?: boolean;
  disabled: boolean;
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
        destructive && styles.destructiveButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chevron: { color: colors.mutedInk, fontSize: 24 },
  codeInput: { fontSize: 22, fontWeight: '700', letterSpacing: 7, textAlign: 'center' },
  destructive: { color: colors.danger },
  destructiveButton: { backgroundColor: colors.danger },
  disabled: { opacity: 0.5 },
  emailCopy: { color: colors.rose, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: spacing.md },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: spacing.md },
  input: {
    backgroundColor: colors.parchment,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.plumInk,
    fontFamily: typography.body,
    fontSize: 16,
    marginTop: spacing.lg,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  label: { color: colors.rose, fontFamily: typography.label, fontSize: 11, letterSpacing: 1.2 },
  notice: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: spacing.sm },
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
