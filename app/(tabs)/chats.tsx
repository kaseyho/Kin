import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/design/tokens';

export default function ChatsRoute() {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Chats
      </Text>
      <Text style={styles.copy}>The people who matter, close at hand.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.parchment,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 72,
  },
  title: {
    color: colors.plumInk,
    fontSize: 36,
    fontWeight: '700',
  },
  copy: {
    color: colors.mutedInk,
    fontSize: 16,
    marginTop: spacing.sm,
  },
});
