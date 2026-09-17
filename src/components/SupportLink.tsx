import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { createSupportMailto, normalizeSupportEmail } from '@/config/support';
import { colors, radii, spacing } from '@/design/tokens';

interface SupportLinkProps {
  supportEmail: string;
}

export function SupportLink({ supportEmail }: SupportLinkProps) {
  const [error, setError] = useState('');
  const reachableEmail = normalizeSupportEmail(supportEmail);

  if (!reachableEmail) {
    return (
      <View accessibilityLabel="Kin support contact unavailable" style={styles.unavailable}>
        <Text style={styles.linkLabel}>Support contact unavailable</Text>
        <Text style={styles.email}>Support contact is not configured for this build.</Text>
      </View>
    );
  }
  const verifiedEmail = reachableEmail;

  async function openSupport() {
    setError('');
    try {
      await Linking.openURL(createSupportMailto(verifiedEmail));
    } catch {
      setError(`Kin could not open your email app. Write to ${verifiedEmail}.`);
    }
  }

  return (
    <View>
      <Pressable
        accessibilityLabel={`Email Kin support at ${verifiedEmail}`}
        accessibilityRole="link"
        onPress={() => void openSupport()}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={styles.linkLabel}>Email Kin support</Text>
        <Text selectable style={styles.email}>{verifiedEmail}</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  email: { color: colors.mutedInk, fontSize: 12, marginTop: 3 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  link: {
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkLabel: { color: colors.plumInk, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  unavailable: {
    backgroundColor: colors.parchment,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
