import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { useKin } from '@/state/useKin';

interface SpaceSafetyActionsProps {
  onReport: () => void;
  onSpaceUnavailable: () => void;
  partnerName: string;
  spaceId: string;
  userId: string;
}

type Confirmation = 'block' | 'delete' | 'leave' | null;
type BusyAction = Exclude<Confirmation, null> | 'archive' | null;

export function SpaceSafetyActions({
  onReport,
  onSpaceUnavailable,
  partnerName,
  spaceId,
  userId,
}: SpaceSafetyActionsProps) {
  const kin = useKin();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState('');

  async function archive() {
    setBusyAction('archive');
    setError('');
    try {
      await kin.archiveSpace(spaceId, userId, true);
      onSpaceUnavailable();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not archive this Space.');
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmConnectedAction(action: 'block' | 'leave') {
    setBusyAction(action);
    setError('');
    try {
      if (action === 'leave') await kin.leaveSpace({ spaceId });
      else await kin.blockSpaceMember({ spaceId });
      onSpaceUnavailable();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Kin could not ${action} this Space.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteLocalCopy() {
    if (deletePhrase !== 'DELETE') {
      setError('Type DELETE exactly to remove this local copy.');
      return;
    }
    setBusyAction('delete');
    setError('');
    try {
      await kin.deleteLocalSpace(spaceId, userId, deletePhrase);
      onSpaceUnavailable();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not remove this local copy.');
    } finally {
      setBusyAction(null);
    }
  }

  function cancelConfirmation() {
    if (busyAction !== null) return;
    setConfirmation(null);
    setDeletePhrase('');
    setError('');
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>SPACE CONTROLS</Text>
      <Text style={styles.copy}>Archive hides this Space for you and can be reversed from Profile.</Text>
      <ActionButton
        disabled={busyAction !== null}
        label={busyAction === 'archive' ? 'Archiving…' : 'Archive this Kin Space'}
        onPress={() => void archive()}
      />

      <Text style={styles.safetyLabel}>SAFETY & ACCESS</Text>
      <ActionButton
        disabled={busyAction !== null}
        label="Report this Kin Space"
        onPress={onReport}
      />

      {kin.mode === 'connected' ? (
        <View style={styles.destructiveGroup}>
          <ActionButton
            destructive
            disabled={busyAction !== null}
            label="Leave this Kin Space"
            onPress={() => {
              setConfirmation('leave');
              setError('');
            }}
          />
          <ActionButton
            destructive
            disabled={busyAction !== null}
            label={`Block ${partnerName}`}
            onPress={() => {
              setConfirmation('block');
              setError('');
            }}
          />
        </View>
      ) : (
        <>
          <Text style={styles.demoCopy}>
            Demo deletion removes demo data on this device only. It does not erase another person’s copy.
          </Text>
          <ActionButton
            destructive
            disabled={busyAction !== null}
            label="Delete local copy"
            onPress={() => {
              setConfirmation('delete');
              setError('');
            }}
          />
        </>
      )}

      <Modal
        animationType="none"
        onRequestClose={cancelConfirmation}
        transparent
        visible={confirmation !== null}
      >
        <View style={styles.modalRoot}>
          <AccessibleSheet
            closeLabel="Close Space safety confirmation"
            label="Confirm Space safety action"
            onClose={cancelConfirmation}
            visible={confirmation !== null}
          >
            <Text accessibilityRole="header" style={styles.confirmationTitle}>
              {confirmation === 'leave'
                ? 'Leave this Kin Space?'
                : confirmation === 'block'
                  ? `Block ${partnerName}?`
                  : 'Delete this local copy?'}
            </Text>
            <Text style={styles.warning}>
              {confirmation === 'leave'
                ? `You will lose access to messages and shared history in this Space. Your private Memories will no longer be available here. ${partnerName} keeps shared history already in their account.`
                : confirmation === 'block'
                  ? `Blocking ${partnerName} stops new messages and prevents you from reconnecting. You will also lose access to this Space.`
                  : 'This removes the demo data on this device only. Type DELETE to confirm.'}
            </Text>
            {confirmation === 'delete' ? (
              <TextInput
                accessibilityLabel="Type DELETE to confirm"
                autoCapitalize="characters"
                onChangeText={setDeletePhrase}
                placeholder="Type DELETE"
                style={styles.input}
                value={deletePhrase}
              />
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityLabel={confirmation === 'leave'
                ? 'Confirm leave'
                : confirmation === 'block'
                  ? 'Confirm block'
                  : 'Confirm local deletion'}
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPress={() => {
                if (!confirmation) return;
                if (confirmation === 'delete') void deleteLocalCopy();
                else void confirmConnectedAction(confirmation);
              }}
              style={[styles.confirmDestructive, busyAction !== null && styles.disabled]}
            >
              <Text style={styles.confirmDestructiveText}>
                {busyAction
                  ? 'Finishing…'
                  : confirmation === 'leave'
                    ? 'Leave Space'
                    : confirmation === 'block'
                      ? `Block ${partnerName}`
                      : 'Delete local copy'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Cancel destructive action"
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPress={cancelConfirmation}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Keep this Space</Text>
            </Pressable>
          </AccessibleSheet>
        </View>
      </Modal>
      {!confirmation && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ActionButton({
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
      style={[styles.action, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, destructive && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  actionText: { color: colors.plumInk, fontSize: 14, fontWeight: '800' },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  cancelText: { color: colors.mutedInk, fontSize: 13, fontWeight: '800' },
  confirmationTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 21, fontWeight: '800' },
  confirmDestructive: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radii.md, justifyContent: 'center', marginTop: spacing.lg, minHeight: 48 },
  confirmDestructiveText: { color: colors.paper, fontSize: 14, fontWeight: '800' },
  copy: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  demoCopy: { color: colors.mutedInk, fontSize: 12, lineHeight: 18, marginTop: spacing.lg },
  destructiveGroup: { marginTop: spacing.xs },
  destructiveText: { color: colors.danger },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  input: { backgroundColor: colors.parchment, borderColor: colors.danger, borderRadius: radii.md, borderWidth: 1, color: colors.plumInk, marginTop: spacing.md, minHeight: 50, paddingHorizontal: spacing.md },
  label: { color: colors.mutedInk, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  modalRoot: { flex: 1 },
  safetyLabel: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginTop: spacing.xxl },
  warning: { color: colors.plumInk, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },
  wrap: { borderTopColor: colors.keyline, borderTopWidth: 1, marginTop: spacing.xl, paddingTop: spacing.xl },
});
