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

import { createAppRuntime, type AppRuntime } from '@/bootstrap/createAppRuntime';
import { ConfigurationErrorScreen } from '@/components/ConfigurationErrorScreen';
import { colors, typography } from '@/design/tokens';
import { useReducedMotion } from '@/accessibility/useReducedMotion';
import { KinProvider } from '@/state/KinProvider';
import { AuthProvider } from '@/state/AuthProvider';
import { useAuth } from '@/state/useAuth';
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
      <AuthProvider service={runtime.authService}>
        <AuthenticatedApp reducedMotion={reducedMotion} runtime={runtime} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

function AuthenticatedApp({
  reducedMotion,
  runtime: readyRuntime,
}: {
  reducedMotion: boolean;
  runtime: Extract<AppRuntime, { status: 'ready' }>;
}) {
  const auth = useAuth();
  const kinActive = auth.state.status === 'demo' || auth.state.status === 'signed-in';
  const kinSessionKey = auth.state.status === 'signed-in' ? auth.state.user.id : auth.state.status;
  const productAvailable = auth.state.status === 'demo' || auth.state.status === 'signed-in';
  const authAvailable = auth.state.status === 'signed-out';

  return (
    <PremiumProvider service={readyRuntime.premiumService}>
      <KinProvider key={kinSessionKey} active={kinActive} repository={readyRuntime.repository}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            animation: reducedMotion ? 'none' : 'fade',
            contentStyle: { backgroundColor: colors.parchment },
            headerShown: false,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Protected guard={authAvailable}>
            <Stack.Screen name="auth" />
          </Stack.Protected>
          <Stack.Protected guard={productAvailable}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="kin-plus" />
            <Stack.Screen name="moment/[momentId]" />
            <Stack.Screen name="space/new" />
            <Stack.Screen name="space/[spaceId]" />
            <Stack.Screen name="space/[spaceId]/relationship" />
            <Stack.Screen name="space/[spaceId]/timeline" />
          </Stack.Protected>
        </Stack>
      </KinProvider>
    </PremiumProvider>
  );
}

const styles = StyleSheet.create({
  fontLoading: { alignItems: 'center', backgroundColor: colors.parchment, flex: 1, justifyContent: 'center' },
  loadingCopy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 13, marginTop: 8 },
  loadingWordmark: { color: colors.rose, fontFamily: typography.display, fontSize: 42 },
});
