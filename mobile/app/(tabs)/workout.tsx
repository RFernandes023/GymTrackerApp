import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { useAuth } from '../../store/authStore';
import { listPlans } from '../../features/workouts/plansRepo';
import { getActiveSessionId, startSession } from '../../features/workouts/sessionsRepo';
import { muscleWeekStats, type MuscleWeek } from '../../features/workouts/statsRepo';
import { MUSCLE_LABELS, type Plan } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

export default function WorkoutHome() {
  const user = useAuth((s) => s.user)!;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muscles, setMuscles] = useState<Awaited<ReturnType<typeof muscleWeekStats>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    void (async () => {
      setPlans(await listPlans(user.id)); setActiveId(await getActiveSessionId(user.id)); setMuscles(await muscleWeekStats(user.id));
    })();
  }, [user.id]));

  const start = async (planId: string | null, dayId: string | null) => {
    try { await startSession(user.id, planId, dayId); router.push('/workout/active'); } catch { setError('Não foi possível iniciar o treino.'); }
  };
  const muscleKeys = Array.from(new Set([...Object.keys(muscles?.thisWeek ?? {}), ...Object.keys(muscles?.lastWeek ?? {})]));
  const cell = (m?: MuscleWeek) => (m ? `${m.sets} séries · ${m.sessions}×` : '—');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <AppText variant="title">Treino</AppText>
        {activeId && (
          <Card style={{ gap: spacing.sm, borderColor: colors.primary }}>
            <AppText variant="h2">Treino em curso</AppText>
            <Button label="Retomar treino" onPress={() => router.push('/workout/active')} />
          </Card>
        )}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
        {!activeId && plans.map((p) => (
          <Card key={p.id} style={{ gap: spacing.sm }}>
            <AppText variant="h2">{p.name}{p.isActive ? ' · ativo' : ''}</AppText>
            {p.days.map((d) => (
              <Button key={d.id} label={`${d.name} · ${d.exercises.length} ex.`} variant="secondary" onPress={() => router.push({ pathname: '/workout/preview', params: { planId: p.id, dayId: d.id } })} />
            ))}
          </Card>
        ))}
        {!activeId && plans.length === 0 && <AppText muted>Cria um plano para começar, ou inicia um treino livre.</AppText>}
        {!activeId && <Button label="Treino livre" variant="secondary" onPress={() => void start(null, null)} />}

        <View style={{ gap: spacing.sm }}>
          <Button label="Planos" variant="secondary" onPress={() => router.push('/plans')} />
          <Button label="Biblioteca de exercícios" variant="secondary" onPress={() => router.push('/exercises')} />
          <Button label="Histórico" variant="secondary" onPress={() => router.push('/workout/history')} />
        </View>

        <Card style={{ gap: spacing.sm }}>
          <AppText variant="h2">Volume por músculo</AppText>
          <AppText variant="small" muted>Séries efetivas (sem aquecimento) e frequência — esta semana vs. anterior</AppText>
          {muscleKeys.length === 0 ? <AppText muted>Sem treinos nas últimas duas semanas.</AppText> : muscleKeys.map((k) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText style={{ flex: 1 }}>{MUSCLE_LABELS[k] ?? k}</AppText>
              <AppText style={{ flex: 1.2 }}>{cell(muscles?.thisWeek[k])}</AppText>
              <AppText muted style={{ flex: 1.2 }}>{cell(muscles?.lastWeek[k])}</AppText>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
