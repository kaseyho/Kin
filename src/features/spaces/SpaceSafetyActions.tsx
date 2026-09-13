import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';
import { useKin } from '@/state/useKin';

interface SpaceSafetyActionsProps {
  spaceId: string;
  userId: string;
  onSpaceUnavailable: () => void;
}

export function SpaceSafetyActions({ onSpaceUnavailable, spaceId, userId }: SpaceSafetyActionsProps) {
  const kin = useKin();
  const [showDelete, setShowDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  async function archive() {
    setError('');
    try {
      await kin.archiveSpace(spaceId, userId, true);
      onSpaceUnavailable();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not archive this Space.');
    }
  }

  async function deleteLocalCopy() {
    if (confirmation !== 'DELETE') {
      setError('Type DELETE exactly to remove this local copy.');
      return;
    }
    setError('');
    try {
      await kin.deleteLocalSpace(spaceId, userId, confirmation);
      onSpaceUnavailable();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not remove this local copy.');
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>SPACE CONTROLS</Text>
      <Text style={styles.copy}>Archive hides this Space for you and can be reversed from Profile.</Text>
      <Pressable accessibilityLabel="Archive this Kin Space" accessibilityRole="button" onPress={archive} style={styles.archive}>
        <Text style={styles.archiveText}>Archive this Kin Space</Text>
      </Pressable>
      <Pressable accessibilityLabel="Delete local copy" accessibilityRole="button" onPress={() => setShowDelete(true)} style={styles.deleteLink}>
        <Text style={styles.deleteLinkText}>Delete local copy</Text>
      </Pressable>
      {showDelete ? (
        <View style={styles.confirmation}>
          <Text style={styles.warning}>This removes the demo data on this device only. It does not claim to erase another person’s copy.</Text>
          <TextInput
            accessibilityLabel="Type DELETE to confirm"
            autoCapitalize="characters"
            onChangeText={setConfirmation}
            placeholder="Type DELETE"
            style={styles.input}
            value={confirmation}
          />
          <Pressable accessibilityLabel="Confirm local deletion" accessibilityRole="button" onPress={deleteLocalCopy} style={styles.confirmDelete}>
            <Text style={styles.confirmDeleteText}>Confirm local deletion</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  archive: { borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.lg, minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  archiveText: { color: colors.plumInk, fontSize: 14, fontWeight: '800' },
  confirmDelete: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radii.md, minHeight: 48, justifyContent: 'center' },
  confirmDeleteText: { color: colors.paper, fontSize: 14, fontWeight: '800' },
  confirmation: { gap: spacing.md, marginTop: spacing.md },
  copy: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  deleteLink: { alignSelf: 'flex-start', marginTop: spacing.lg, minHeight: 44, justifyContent: 'center' },
  deleteLinkText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  input: { backgroundColor: colors.paper, borderColor: colors.danger, borderRadius: radii.md, borderWidth: 1, color: colors.plumInk, minHeight: 50, paddingHorizontal: spacing.md },
  label: { color: colors.mutedInk, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  warning: { color: colors.plumInk, fontSize: 13, lineHeight: 19 },
  wrap: { borderTopColor: colors.keyline, borderTopWidth: 1, marginTop: spacing.xl, paddingTop: spacing.xl },
});
