import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { RepositoryError } from '@/data/errors';
import { colors, radii, spacing, typography } from '@/design/tokens';
import type { UserProfile } from '@/domain/models';
import { useKin } from '@/state/useKin';

interface EditProfileSheetProps {
  onClose: () => void;
  profile: UserProfile;
  visible: boolean;
}

export function EditProfileSheet({ onClose, profile, visible }: EditProfileSheetProps) {
  const kin = useKin();
  const [name, setName] = useState(profile.displayName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError('Tell Kin what to call you.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await kin.saveProfile({
        avatarUri: profile.avatarUri,
        displayName: name,
      });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof RepositoryError
          ? reason.message
          : 'Kin could not save your profile. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessibleSheet
      closeLabel="Close edit profile"
      label="Edit profile"
      onClose={onClose}
      visible={visible}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.eyebrow}>YOUR KIN PROFILE</Text>
        <Text accessibilityRole="header" style={styles.title}>Edit profile</Text>
        <Text style={styles.copy}>This is the name your people see across your shared Spaces.</Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            accessibilityLabel="Display name"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            editable={!saving}
            onChangeText={setName}
            onSubmitEditing={() => void save()}
            placeholder="Your name"
            placeholderTextColor={colors.mutedInk}
            returnKeyType="done"
            style={styles.input}
            value={name}
          />
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            disabled={saving}
            onPress={onClose}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={saving ? 'Saving…' : 'Save changes'}
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              saving && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </AccessibleSheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  copy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginBottom: spacing.sm },
  eyebrow: { color: colors.rose, fontFamily: typography.label, fontSize: 11, letterSpacing: 1.2 },
  fieldGroup: { marginBottom: spacing.md, marginTop: spacing.xl },
  input: {
    backgroundColor: colors.parchment,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.plumInk,
    fontFamily: typography.body,
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  label: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 14, marginBottom: spacing.sm },
  pressed: { opacity: 0.72 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonLabel: { color: colors.paper, fontFamily: typography.label, fontSize: 14 },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.keyline,
    borderRadius: radii.round,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonLabel: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 14 },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 28, marginTop: spacing.xs },
});
