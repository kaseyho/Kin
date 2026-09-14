import { Image, StyleSheet, Text, View } from 'react-native';

import { kinImageSource } from '@/design/assets';
import { colors } from '@/design/tokens';

interface AvatarProps {
  name: string;
  size?: number;
  accent?: string;
  uri?: string;
}

export function Avatar({ accent = colors.rose, name, size = 48, uri }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <View
      accessibilityLabel={`${name} avatar`}
      style={[styles.avatar, { backgroundColor: accent, borderRadius: size / 2, height: size, width: size }]}
    >
      {uri ? (
        <Image accessible={false} source={kinImageSource(uri)} style={styles.image} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{initials || 'K'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: colors.paper,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  image: { height: '100%', width: '100%' },
});
