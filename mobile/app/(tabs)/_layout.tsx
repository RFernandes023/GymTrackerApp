import React from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, TAB_BAR_HEIGHT } from '../../theme/tokens';

const icon = (on: React.ComponentProps<typeof Ionicons>['name'], off: React.ComponentProps<typeof Ionicons>['name']) =>
  ({ color, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? on : off} color={color as string} size={25} />
  );

export default function TabsLayout() {
  // a barra cresce com a área dos botões/gestos do Android: os menus nunca ficam por baixo deles
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: TAB_BAR_HEIGHT + bottom, paddingTop: 6, paddingBottom: bottom + 6, elevation: 0 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="workout" options={{ title: 'Treino', tabBarIcon: icon('barbell', 'barbell-outline') }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrição', tabBarIcon: icon('nutrition', 'nutrition-outline') }} />
      <Tabs.Screen name="progress" options={{ title: 'Evolução', tabBarIcon: icon('trending-up', 'trending-up-outline') }} />
    </Tabs>
  );
}
