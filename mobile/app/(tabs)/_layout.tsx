import React from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme/tokens';

const icon = (on: React.ComponentProps<typeof Ionicons>['name'], off: React.ComponentProps<typeof Ionicons>['name']) =>
  ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? on : off} color={color as string} size={size + 1} />
  );

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 68,
          paddingTop: 8,
          paddingBottom: 10,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarItemStyle: { borderRadius: radius.md },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="workout" options={{ title: 'Treino', tabBarIcon: icon('barbell', 'barbell-outline') }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrição', tabBarIcon: icon('nutrition', 'nutrition-outline') }} />
      <Tabs.Screen name="progress" options={{ title: 'Evolução', tabBarIcon: icon('trending-up', 'trending-up-outline') }} />
      <Tabs.Screen name="coach" options={{ href: null }} />
    </Tabs>
  );
}
