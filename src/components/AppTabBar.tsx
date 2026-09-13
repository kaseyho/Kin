import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';

export type AppTabRoute = 'chats' | 'moments' | 'profile';

interface AppTabBarProps {
  activeRoute: AppTabRoute;
  onSelect: (route: AppTabRoute) => void;
}

const tabs: readonly { route: AppTabRoute; label: string; glyph: string }[] = [
  { route: 'chats', label: 'Chats', glyph: '●' },
  { route: 'moments', label: 'Moments', glyph: '◇' },
  { route: 'profile', label: 'Profile', glyph: '○' },
];

export function AppTabBar({ activeRoute, onSelect }: AppTabBarProps) {
  return (
    <View accessibilityRole="tablist" style={styles.container}>
      {tabs.map((tab) => {
        const selected = tab.route === activeRoute;

        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.route}
            onPress={() => onSelect(tab.route)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Text aria-hidden style={[styles.glyph, selected && styles.glyphSelected]}>
              {tab.glyph}
            </Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-around',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  tab: {
    alignItems: 'center',
    borderRadius: radii.md,
    minHeight: 48,
    minWidth: 78,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.64,
  },
  glyph: {
    color: colors.mutedInk,
    fontSize: 16,
    lineHeight: 18,
  },
  glyphSelected: {
    color: colors.rose,
  },
  label: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  labelSelected: {
    color: colors.plumInk,
  },
});
