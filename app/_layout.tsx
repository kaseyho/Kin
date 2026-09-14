import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  Manrope_400Regular,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { StyleSheet, Text, View } from 'react-native';

import { createRepository } from '@/data/createRepository';
import { colors, typography } from '@/design/tokens';
import { useReducedMotion } from '@/accessibility/useReducedMotion';
import { KinProvider } from '@/state/KinProvider';
import { PremiumProvider } from '@/features/premium/PremiumProvider';
import { createPremiumService } from '@/services/billing';

const repository = createRepository(AsyncStorage);
const premiumService = createPremiumService(AsyncStorage);

export default function RootLayout() {
  const reducedMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_700Bold,
    Manrope_400Regular,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View accessibilityLabel="Opening Kin" style={styles.fontLoading}>
        <Text style={styles.loadingWordmark}>kin</Text>
        <Text style={styles.loadingCopy}>Bringing your people close…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PremiumProvider service={premiumService}>
        <KinProvider repository={repository}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              animation: reducedMotion ? 'none' : 'fade',
              contentStyle: { backgroundColor: colors.parchment },
              headerShown: false,
            }}
          />
        </KinProvider>
      </PremiumProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fontLoading: { alignItems: 'center', backgroundColor: colors.parchment, flex: 1, justifyContent: 'center' },
  loadingCopy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 13, marginTop: 8 },
  loadingWordmark: { color: colors.rose, fontFamily: typography.display, fontSize: 42 },
});
