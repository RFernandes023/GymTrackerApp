import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../store/authStore';
import { cleanupTempImages } from '../services/tempFiles';
import { startSyncScheduler } from '../services/syncScheduler';
import { applyReminders, configureNotifications } from '../services/notifications';
import { colors } from '../theme/tokens';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

export default function RootLayout() {
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  // limpeza de imagens temporárias com mais de 7 dias (RGPD / minimização)
  useEffect(() => { if (status === 'signedIn') void cleanupTempImages(); }, [status]);
  const userId = useAuth((s) => s.user?.id);
  useEffect(() => { void configureNotifications(); }, []);
  useEffect(() => { if (status === 'signedIn' && userId) void applyReminders(userId).catch(() => {}); }, [status, userId]);
  // sincronização offline-first: arranca com a sessão e pára ao terminá-la
  useEffect(() => { if (status === 'signedIn' && userId) return startSyncScheduler(userId); }, [status, userId]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          {/* Rotas privadas: só acessíveis com sessão */}
          <Stack.Protected guard={status === 'signedIn'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" options={{ presentation: 'card' }} />
            <Stack.Screen name="exercises/index" />
            <Stack.Screen name="exercises/[id]" />
            <Stack.Screen name="exercises/new" />
            <Stack.Screen name="plans/index" />
            <Stack.Screen name="plans/[id]" />
            <Stack.Screen name="workout/active" options={{ gestureEnabled: false }} />
            <Stack.Screen name="workout/history" />
            <Stack.Screen name="workout/preview" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="sync" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="import-plan" />
            <Stack.Screen name="export" />
            <Stack.Screen name="progress/new" />
            <Stack.Screen name="workout/summary/[id]" options={{ gestureEnabled: false }} />
            <Stack.Screen name="nutrition/add" />
            <Stack.Screen name="nutrition/log" />
            <Stack.Screen name="nutrition/food-form" />
            <Stack.Screen name="nutrition/scan" />
            <Stack.Screen name="nutrition/label" />
            <Stack.Screen name="nutrition/goals" />
            <Stack.Screen name="nutrition/meal-photo" />
            <Stack.Screen name="recipes/index" />
            <Stack.Screen name="recipes/[id]" />
          </Stack.Protected>
          <Stack.Screen name="privacy" />
          <Stack.Protected guard={status === 'signedOut'}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
