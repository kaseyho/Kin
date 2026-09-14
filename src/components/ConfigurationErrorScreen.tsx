import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/design/tokens';

export function ConfigurationErrorScreen({ message }: { message: string }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.wordmark}>kin</Text>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>DEVELOPER SETUP</Text>
          <Text accessibilityRole="header" style={styles.title}>Kin needs configuration</Text>
          <Text style={styles.message}>{message}</Text>
          <Text style={styles.guidance}>
            Open the developer setup guide, update the environment, then restart Kin.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: 520,
    padding: spacing.xl,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  guidance: {
    color: colors.plumInk,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xl,
  },
  message: {
    color: colors.mutedInk,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 23,
    marginTop: spacing.md,
  },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  title: {
    color: colors.plumInk,
    fontFamily: typography.display,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: spacing.sm,
  },
  wordmark: {
    color: colors.rose,
    fontFamily: typography.display,
    fontSize: 24,
    fontWeight: '900',
  },
});
