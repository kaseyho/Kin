import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/design/tokens';

export function KeptCorner() {
  return (
    <View accessibilityLabel="Kept as a Moment" style={styles.corner}>
      <Text style={styles.glyph}>⌞</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { alignItems: 'center', backgroundColor: colors.rose, height: 20, justifyContent: 'center', position: 'absolute', right: 0, top: 0, width: 20 },
  glyph: { color: colors.paper, fontSize: 12, fontWeight: '900' },
});
