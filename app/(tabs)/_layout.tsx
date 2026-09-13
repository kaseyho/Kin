import { Tabs } from 'expo-router';

import { AppTabBar, AppTabRoute } from '@/components/AppTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ navigation, state }) => (
        <AppTabBar
          activeRoute={state.routes[state.index].name as AppTabRoute}
          onSelect={(route) => navigation.navigate(route)}
        />
      )}
    >
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="moments" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
