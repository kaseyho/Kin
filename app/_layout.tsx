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

import { createAppRuntime } from '@/bootstrap/createAppRuntime';
import { ConfigurationErrorScreen } from '@/components/ConfigurationErrorScreen';
import { colors, typography } from '@/design/tokens';
import { useReducedMotion } from '@/accessibility/useReducedMotion';
import { KinProvider } from '@/state/KinProvider';
import { PremiumProvider } from '@/features/premium/PremiumProvider';

const runtime = createAppRuntime(AsyncStorage);

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

  if (runtime.status === 'configuration-error') {
    return <ConfigurationErrorScreen message={runtime.error.message} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PremiumProvider service={runtime.premiumService}>
        <KinProvider repository={runtime.repository}>
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
