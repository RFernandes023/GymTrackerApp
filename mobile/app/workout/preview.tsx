import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { GOAL_LABELS, SET_TYPE_LABELS, formatWeight } from '@gym/shared';
import { AppText, Button, Card, Screen, BackLink } from '../../components/ui';
import { useAuth } from '../../store/authStore';
import { getPlan } from '../../features/workouts/plansRepo';
import { getActiveSessionId, planSessionExercises, startSession, type PlannedExercise, type PlannedSet } from '../../features/workouts/sessionsRepo';
import { getBodyInfo } from '../../features/profile/profileRepo';
import type { Plan, PlanDay } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

const SOURCE: Record<PlannedSet['source'], string> = { history: 'último treino', estimate: 'estimativa', plan: 'plano' };

export default function WorkoutPreview() {
  const user = useAuth((s) => s.user)!;
  const { planId, dayId } = useLocalSearchParams<{ planId: string; dayId: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [day, setDay] = useState<PlanDay | null>(null);
  const [items, setItems] = useState<PlannedExercise[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useFocusEffect(useCallback(() => { void (async () => {
    const p = await getPlan(String(planId)); const d = p?.days.find((x) => x.id === dayId) ?? null;
    setPlan(p); setDay(d);
    if (p && d) setItems(await planSessionExercises(user.id, d, p.goal));
    setActiveId(await getActiveSessionId(user.id)); setHasProfile(!!(await getBodyInfo(user.id)));
  })(); }, [user.id, planId, dayId]));

  const start = async () => {
    try { setStarting(true); await startSession(user.id, String(planId), String(dayId)); router.replace('/workout/active'); }
    catch { setError('Não foi possível iniciar o treino.'); setStarting(false); }
  };

  if (!plan || !day) return <Screen><View style={{ padding: spacing.lg }}><AppText muted>A carregar…</AppText></View></Screen>;
  const needsProfile = !hasProfile && items.some((e) => !e.hasHistory && e.sets.every((s) => s.weight === 0));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <BackLink />
        <View>
          <AppText variant="small" muted>{plan.name} · {GOAL_LABELS[plan.goal]}</AppText>
          <AppText variant="title">{day.name}</AppText>
          <AppText muted>{items.length} exercício(s) · {items.reduce((n, e) => n + e.sets.length, 0)} séries</AppText>
        </View>

        {activeId ? (
          <Card style={{ gap: spacing.sm, borderColor: colors.warning }}>
            <AppText>Já tens um treino em curso. Termina-o ou retoma-o antes de iniciar outro.</AppText>
            <Button label="Retomar treino em curso" onPress={() => router.replace('/workout/active')} />
          </Card>
        ) : <Button label="Iniciar treino" loading={starting} disabled={items.length === 0} onPress={() => void start()} />}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}

        {needsProfile && (
          <Card style={{ gap: spacing.sm }}>
            <AppText>Define o teu perfil corporal para eu sugerir cargas iniciais adequadas aos exercícios novos.</AppText>
            <Button label="Definir perfil" variant="secondary" onPress={() => router.push('/profile')} />
          </Card>
        )}
        {items.length === 0 && <AppText muted>Este treino ainda não tem exercícios. Edita o plano para adicionar.</AppText>}

        {items.map((e) => (
          <Card key={e.planExerciseId} style={{ gap: spacing.xs, borderLeftWidth: e.group ? 4 : 1, borderLeftColor: e.group ? colors.accent : colors.border }}>
            <AppText style={{ fontWeight: '600' }}>{e.group ? '⛓ ' : ''}{e.name}</AppText>
            {e.sets.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText muted>{i + 1}. {SET_TYPE_LABELS[s.type]}</AppText>
                <AppText>{s.weight > 0 ? `${formatWeight(s.weight)} kg` : '—'} · {s.repMin === s.repMax ? s.repMin : `${s.repMin}–${s.repMax}`} reps <AppText variant="small" muted>({SOURCE[s.source]})</AppText></AppText>
              </View>
            ))}
            {e.estimateNote ? <AppText variant="small" style={{ color: colors.accent }}>1.ª vez: carga estimada. {e.estimateNote}</AppText> : null}
            {!e.hasHistory && !e.estimateNote && e.sets.every((s) => s.weight === 0) ? <AppText variant="small" muted>Sem histórico: escolhe a carga durante o treino.</AppText> : null}
          </Card>
        ))}
        <Button label="Editar plano" variant="secondary" onPress={() => router.push({ pathname: '/plans/[id]', params: { id: plan.id } })} />
      </ScrollView>
    </Screen>
  );
}
