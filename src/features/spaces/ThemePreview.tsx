import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';

interface ThemePreviewProps {
  accent: string;
  ink: string;
  name: string;
  wallpaper: string;
  wallpaperPattern: string;
}

export function ThemePreview({ accent, ink, name, wallpaper, wallpaperPattern }: ThemePreviewProps) {
  return (
    <View
      accessibilityLabel={`${name} relationship preview`}
      style={[styles.frame, { backgroundColor: wallpaper, borderColor: accent }]}
    >
      <Text style={[styles.pattern, { color: accent }]}>{patternGlyph(wallpaperPattern)}</Text>
      <View style={[styles.bubble, styles.received]}>
        <Text style={[styles.copy, { color: ink }]}>Found our place.</Text>
      </View>
      <View style={[styles.bubble, styles.sent, { backgroundColor: accent }]}>
        <Text style={[styles.copy, { color: colors.paper }]}>Keeping this one.</Text>
      </View>
    </View>
  );
}

function patternGlyph(pattern: string): string {
  if (pattern === 'stars') return '·  ✦  ·     ·  ✧';
  if (pattern === 'leaves') return '⌁   ❧      ⌁';
  if (pattern === 'postmarks') return 'K — 05 · 12 — J';
  return 'quiet paper';
}

const styles = StyleSheet.create({
  bubble: { borderRadius: radii.md, marginTop: spacing.sm, maxWidth: '74%', padding: spacing.md },
  copy: { fontSize: 13, fontWeight: '600' },
  frame: {
    borderRadius: radii.lg,
    borderWidth: 1,
    minHeight: 168,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  pattern: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, opacity: 0.48 },
  received: { backgroundColor: colors.paper },
  sent: { alignSelf: 'flex-end' },
});
