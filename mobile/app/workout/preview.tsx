import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GOAL_LABELS, SET_TYPE_LABELS, formatWeight } from '@gym/shared';
import { AppText, Button, Card, EmptyState, IconButton, Screen, ScreenHeader } from '../../components/ui';
import { useAuth } from '../../store/authStore';
import { getPlan } from '../../features/workouts/plansRepo';
import { getActiveSessionId, planSessionExercises, startSession, type PlannedExercise, type PlannedSet } from '../../features/workouts/sessionsRepo';
import { getBodyInfo } from '../../features/profile/profileRepo';
import type { Plan, PlanDay } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

const SOURCE: Record<PlannedSet['source'], string> = { history: 'do último treino', estimate: 'estimativa', plan: 'do plano' };
/** Um segundo toque acidental ao abrir o ecrã não pode iniciar o treino. */
const GUARD_MS = process.env.NODE_ENV === 'test' ? 0 : 700;

const reps = (s: PlannedSet) => (s.repMin === s.repMax ? `${s.repMin}` : `${s.repMin}–${s.repMax}`);
/** "3 × 8–12 reps · 60 kg": resumo das séries efetivas. */
function summary(e: PlannedExercise) {
  const w = e.sets.filter((s) => s.type === 'working' || s.type === 'failure');
  const list = w.length ? w : e.sets, f = list[0];
  if (!f) return 'Sem séries';
  const ws = Array.from(new Set(list.map((s) => s.weight))).filter((x) => x > 0);
  const kg = ws.length === 0 ? '' : ws.length === 1 ? ` · ${formatWeight(ws[0]!)} kg` : ` · ${formatWeight(Math.min(...ws))}–${formatWeight(Math.max(...ws))} kg`;
  return `${list.length} × ${reps(f)} reps${kg}`;
}

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
  const [open, setOpen] = useState<string | null>(null);
  const openedAt = useRef(Date.now());

  useFocusEffect(useCallback(() => { void (async () => {
    const p = await getPlan(String(planId)); const d = p?.days.find((x) => x.id === dayId) ?? null;
    setActiveId(await getActiveSessionId(user.id)); setHasProfile(!!(await getBodyInfo(user.id)));
    if (p && d) setItems(await planSessionExercises(user.id, d, p.goal));
    setPlan(p); setDay(d);
  })(); }, [user.id, planId, dayId]));

  const start = async () => {
    if (starting || Date.now() - openedAt.current < GUARD_MS) return;
    try { setStarting(true); await startSession(user.id, String(planId), String(dayId)); router.replace('/workout/active'); }
    catch { setError('Não foi possível iniciar o treino.'); setStarting(false); }
  };

  if (!plan || !day) return <Screen><View style={{ padding: spacing.lg, gap: spacing.lg }}><ScreenHeader title="Treino" /><AppText muted>A carregar…</AppText></View></Screen>;
  const needsProfile = !hasProfile && items.some((e) => !e.hasHistory && e.sets.every((s) => s.weight === 0));
  const edit = () => router.push({ pathname: '/plans/[id]', params: { id: plan.id } });

  return (
    <Screen footer={activeId ? (
      <>
        <AppText variant="small" style={{ color: colors.warning }}>Já tens um treino em curso. Termina-o ou retoma-o antes de iniciar outro.</AppText>
        <Button label="Retomar treino em curso" onPress={() => router.replace('/workout/active')} />
      </>
    ) : (
      <>
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
        <Button label="Iniciar treino" icon="play" loading={starting} disabled={items.length === 0} onPress={() => void start()} />
      </>
    )}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <ScreenHeader title={day.name} sub={`${plan.name} · ${GOAL_LABELS[plan.goal]}`} right={<IconButton name="create-outline" label="Editar plano" onPress={edit} />} />
        <AppText muted>{items.length} exercício{items.length === 1 ? '' : 's'} · {items.reduce((n, e) => n + e.sets.length, 0)} séries. O treino só começa quando tocares em “Iniciar”.</AppText>

        {needsProfile && (
          <Card style={{ gap: spacing.sm }}>
            <AppText>Define o teu perfil corporal para eu sugerir cargas iniciais adequadas.</AppText>
            <Button label="Definir perfil" variant="secondary" compact onPress={() => router.push('/profile')} />
          </Card>
        )}
        {items.length === 0 && <EmptyState icon="barbell-outline" title="Sem exercícios" text="Este treino ainda está vazio." action={{ label: 'Adicionar exercícios', onPress: edit }} />}

        {items.map((e, i) => {
          const isOpen = open === e.planExerciseId;
          return (
            <Card key={e.planExerciseId} style={{ gap: spacing.sm, padding: 0, borderLeftWidth: e.group ? 4 : 1, borderLeftColor: e.group ? colors.accent : colors.border }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Ver séries de ${e.name}`} accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : e.planExerciseId)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }}>
                <AppText variant="h2" style={{ color: colors.textMuted, minWidth: 20 }}>{i + 1}</AppText>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText style={{ fontWeight: '600' }}>{e.name}</AppText>
                  <AppText variant="small" muted>{summary(e)}{e.group ? ' · superset' : ''}</AppText>
                  {e.estimateNote ? <AppText variant="small" style={{ color: colors.accent }}>1.ª vez: carga estimada</AppText> : null}
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Pressable>
              {isOpen && (
                <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
                  {e.sets.map((s, k) => (
                    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                      <AppText variant="small" muted>{k + 1}. {SET_TYPE_LABELS[s.type]}</AppText>
                      <AppText variant="small">{s.weight > 0 ? `${formatWeight(s.weight)} kg · ` : ''}{reps(s)} reps <AppText variant="small" muted>({SOURCE[s.source]})</AppText></AppText>
                    </View>
                  ))}
                  {e.estimateNote ? <AppText variant="small" muted>{e.estimateNote}</AppText> : null}
                  {!e.hasHistory && !e.estimateNote && e.sets.every((s) => s.weight === 0) ? <AppText variant="small" muted>Sem histórico: escolhe a carga durante o treino.</AppText> : null}
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
