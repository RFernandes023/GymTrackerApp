import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { formatDuration } from '@gym/shared';
import { AppText, Button, Screen, ScreenHeader, EmptyState } from '../../components/ui';
import { useAuth } from '../../store/authStore';
import { listHistory } from '../../features/workouts/sessionsRepo';
import { colors, radius, spacing } from '../../theme/tokens';
import { fmtDateTime, fmtKg } from '../../utils/format';

type Item = Awaited<ReturnType<typeof listHistory>>[number];
const PAGE = 30;

export default function History() {
  const user = useAuth((s) => s.user)!;
  const [items, setItems] = useState<Item[]>([]);
  const [done, setDone] = useState(false);
  const load = useCallback(async (offset: number) => {
    const rows = await listHistory(user.id, PAGE, offset);
    setItems((p) => (offset === 0 ? rows : [...p, ...rows])); setDone(rows.length < PAGE);
  }, [user.id]);
  useFocusEffect(useCallback(() => { void load(0); }, [load]));
  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.md, flex: 1 }}>
        <ScreenHeader title="Histórico" />
        <FlatList data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: spacing.sm }}
          onEndReached={() => { if (!done) void load(items.length); }} onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyState icon="time-outline" title="Sem treinos concluídos" text="Quando terminares um treino, aparece aqui." />}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/workout/summary/[id]', params: { id: item.id } })}
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
              <AppText style={{ fontWeight: '600' }}>{item.name}</AppText>
              <AppText variant="small" muted>{fmtDateTime(item.completedAt)} · {formatDuration(item.durationMs)} · {fmtKg(item.volume)}</AppText>
            </Pressable>
          )} />
      </View>
    </Screen>
  );
}
