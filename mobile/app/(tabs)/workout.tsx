import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText, Button, Card, EmptyState, ListGroup, ListRow, Screen, SectionTitle, TabHeader } from '../../components/ui';
import { ActiveWorkoutCard } from '../../components/ActiveWorkoutCard';
import { ProgressBar } from '../../components/Progress';
import { useAuth } from '../../store/authStore';
import { listPlans } from '../../features/workouts/plansRepo';
import { getActiveSessionId, getSession, startSession } from '../../features/workouts/sessionsRepo';
import { dashboardStats, muscleWeekStats, type DashboardStats } from '../../features/workouts/statsRepo';
import { DAY_LABELS, MUSCLE_LABELS, type Plan, type Session } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

export default function WorkoutHome() {
  const user = useAuth((s) => s.user)!;
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [active, setActive] = useState<Session | null>(null);
  const [next, setNext] = useState<DashboardStats['nextWorkout']>(null);
  const [muscles, setMuscles] = useState<Awaited<ReturnType<typeof muscleWeekStats>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const id = await getActiveSessionId(user.id);
    setActive(id ? await getSession(id) : null);
    setPlans(await listPlans(user.id));
    const st = await dashboardStats(user.id); setNext(st.todayWorkout ?? st.nextWorkout);
    setMuscles(await muscleWeekStats(user.id));
  }, [user.id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const startFree = () => Alert.alert('Iniciar treino livre?', 'Começa um treino vazio e o cronómetro. Vais adicionando os exercícios à medida que treinas.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Iniciar', onPress: async () => { try { await startSession(user.id, null, null); router.push('/workout/active'); } catch { setError('Não foi possível iniciar o treino.'); } } },
  ]);

  const plan = plans?.find((p) => p.isActive) ?? plans?.[0] ?? null;
  const rows = Array.from(new Set([...Object.keys(muscles?.thisWeek ?? {}), ...Object.keys(muscles?.lastWeek ?? {})]))
    .map((k) => ({ k, now: muscles?.thisWeek[k]?.sets ?? 0, times: muscles?.thisWeek[k]?.sessions ?? 0, prev: muscles?.lastWeek[k]?.sets ?? 0 })).sort((a, b) => b.now - a.now || b.prev - a.prev);
  const top = Math.max(1, ...rows.map((r) => Math.max(r.now, r.prev)));

  return (
    <Screen tab>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <TabHeader title="Treino" />
        {active && <ActiveWorkoutCard session={active} onChanged={() => void reload()} />}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}

        {plans && !plan && <EmptyState icon="clipboard-outline" title="Ainda não tens um plano" text="Cria um plano com os teus dias de treino, ou começa um treino livre." action={{ label: 'Criar plano', onPress: () => router.push('/plans') }} />}
        {plan && (
          <>
            <SectionTitle action={{ label: 'Editar plano', onPress: () => router.push({ pathname: '/plans/[id]', params: { id: plan.id } }) }}>{plan.name}</SectionTitle>
            <ListGroup>
              {plan.days.map((d) => (
                <ListRow key={d.id} icon="barbell-outline" color={next?.dayId === d.id ? colors.primary : colors.accent} label={`${d.name} · ${d.exercises.length} ex.`} title={d.name}
                  sub={[next?.dayId === d.id ? 'A seguir' : null, d.dayOfWeek ? DAY_LABELS[d.dayOfWeek] : null, `${d.exercises.length} exercício${d.exercises.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/workout/preview', params: { planId: plan.id, dayId: d.id } })} />
              ))}
            </ListGroup>
          </>
        )}
        {!active && <Button label="Treino livre" icon="add" variant="secondary" onPress={startFree} />}

        <ListGroup>
          <ListRow icon="clipboard-outline" title="Planos" sub={plans && plans.length > 1 ? `${plans.length} planos · mudar ou criar` : 'Criar, mudar ou importar'} onPress={() => router.push('/plans')} />
          <ListRow icon="library-outline" color={colors.accent} title="Biblioteca de exercícios" onPress={() => router.push('/exercises')} />
          <ListRow icon="time-outline" color={colors.warning} title="Histórico" onPress={() => router.push('/workout/history')} />
        </ListGroup>

        <SectionTitle>Séries por músculo</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          {rows.length === 0 ? <AppText muted>Sem treinos nas últimas duas semanas.</AppText> : rows.map((r) => (
            <View key={r.k} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                <AppText style={{ flexShrink: 1 }}>{MUSCLE_LABELS[r.k] ?? r.k}</AppText>
                <AppText style={{ fontWeight: '600' }}>{r.now}<AppText variant="small" muted>{r.now > 0 ? ` em ${r.times} treino${r.times === 1 ? '' : 's'}` : ''} · antes {r.prev}</AppText></AppText>
              </View>
              <ProgressBar value={r.now} max={top} color={colors.accent} label={`${MUSCLE_LABELS[r.k] ?? r.k}: ${r.now} séries esta semana, ${r.prev} na anterior`} />
            </View>
          ))}
          {rows.length > 0 && <AppText variant="small" muted>Esta semana, sem aquecimento. “Antes” é a semana passada.</AppText>}
        </Card>
      </ScrollView>
    </Screen>
  );
}
