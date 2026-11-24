import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GOAL_LABELS, SET_TYPE_LABELS, formatWeight, type ExerciseConfig, type TrainingGoal } from '@gym/shared';
import { suggestionFor } from '../../features/workouts/suggest';
import { useAuth } from '../../store/authStore';
import { AppText, Button, Card, IconButton as IconBtn, Screen, ScreenHeader } from '../../components/ui';
import { Chip, ChipRow, Field } from '../../components/form';
import { ExerciseConfigModal } from '../../components/ExerciseConfigModal';
import * as repo from '../../features/workouts/plansRepo';
import { DAY_LABELS, type Plan, type PlanExercise } from '../../features/workouts/types';
import { colors, radius, spacing } from '../../theme/tokens';

const summary = (e: PlanExercise) => {
  const w = e.sets.filter((s) => s.type === 'working' || s.type === 'failure');
  const first = w[0];
  const extras = (['warmup', 'drop', 'rest_pause'] as const).map((t) => { const n = e.sets.filter((s) => s.type === t).length; return n ? `${n}× ${SET_TYPE_LABELS[t].toLowerCase()}` : null; }).filter(Boolean);
  return `${w.length}×${first?.repMin ?? '?'}–${first?.repMax ?? '?'}${first && first.weight > 0 ? ` @ ${formatWeight(first.weight)} kg` : ''} · +${formatWeight(e.weightIncrement)} kg · ${e.restSeconds}s${extras.length ? ' · ' + extras.join(', ') : ''}`;
};

export default function PlanEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = String(id);
  const user = useAuth((s) => s.user)!;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [editing, setEditing] = useState<{ dayId: string; pe: PlanExercise } | null>(null);
  const [openDay, setOpenDay] = useState<string | null | undefined>(undefined); // undefined = 1.º dia aberto
  const [details, setDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setPlan(await repo.getPlan(planId)), [planId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const run = async (fn: () => Promise<unknown>) => { try { setError(null); await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } };

  if (!plan) return <Screen><View style={{ padding: spacing.lg }}><AppText muted>A carregar…</AppText></View></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={plan.name} />
        <Button compact variant="secondary" label={details ? 'Fechar detalhes do plano' : 'Nome e descrição'} icon={details ? 'chevron-up' : 'create-outline'} onPress={() => setDetails(!details)} />
        {details && <><Field label="Nome do plano" defaultValue={plan.name} onEndEditing={(e) => void run(() => repo.updatePlan(planId, { name: e.nativeEvent.text }))} />
        <Field label="Descrição" defaultValue={plan.description ?? ''} multiline onEndEditing={(e) => void run(() => repo.updatePlan(planId, { description: e.nativeEvent.text || null }))} /></>}
        <AppText variant="small" muted>Objetivo do plano (define repetições e descanso dos novos exercícios)</AppText>
        <ChipRow>{(Object.keys(GOAL_LABELS) as TrainingGoal[]).map((g) => <Chip key={g} label={GOAL_LABELS[g]} selected={plan.goal === g} onPress={() => void run(() => repo.updatePlan(planId, { goal: g }))} />)}</ChipRow>
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}

        {plan.days.map((day, di) => { const isOpen = openDay === undefined ? di === 0 : openDay === day.id; return (
          <Card key={day.id} style={{ gap: spacing.md }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${isOpen ? 'Fechar' : 'Abrir'} ${day.name}`} accessibilityState={{ expanded: isOpen }} onPress={() => setOpenDay(isOpen ? null : day.id)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="h2">{day.name}</AppText>
                <AppText variant="small" muted>{day.dayOfWeek ? `${DAY_LABELS[day.dayOfWeek]} · ` : ''}{day.exercises.length} exercício{day.exercises.length === 1 ? '' : 's'}</AppText>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
            </Pressable>
            {isOpen && <>
            <Field label="Dia / treino" defaultValue={day.name} onEndEditing={(e) => void run(() => repo.updateDay(planId, day.id, { name: e.nativeEvent.text }))} />
            <AppText variant="small" muted>Dia da semana (opcional — sem dia = plano flexível)</AppText>
            <ChipRow>
              <Chip label="Livre" selected={day.dayOfWeek === null} onPress={() => void run(() => repo.updateDay(planId, day.id, { dayOfWeek: null }))} />
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} label={DAY_LABELS[d]!.slice(0, 3)} selected={day.dayOfWeek === d} onPress={() => void run(() => repo.updateDay(planId, day.id, { dayOfWeek: d }))} />)}
            </ChipRow>
            {day.exercises.length === 0 && <AppText muted>Sem exercícios.</AppText>}
            {day.exercises.map((e, i) => (
              <View key={e.id} style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderLeftWidth: e.supersetGroup ? 4 : 0, borderLeftColor: colors.accent }}>
                <AppText style={{ fontWeight: '600' }}>{e.name}</AppText>
                <AppText variant="small" muted>{summary(e)}</AppText>
                {e.supersetGroup ? <AppText variant="small" style={{ color: colors.accent }}>Superset</AppText> : null}
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <IconBtn name="create-outline" label={`Editar ${e.name}`} onPress={() => setEditing({ dayId: day.id, pe: e })} />
                  <IconBtn name="chevron-up" label="Subir" onPress={() => void run(() => repo.moveExercise(planId, day.id, e.id, -1))} />
                  <IconBtn name="chevron-down" label="Descer" onPress={() => void run(() => repo.moveExercise(planId, day.id, e.id, 1))} />
                  {i > 0 && <IconBtn name="link-outline" label="Superset com o anterior" color={e.supersetGroup ? colors.accent : colors.text} onPress={() => void run(() => repo.toggleSupersetWithPrevious(planId, day.id, e.id))} />}
                  <IconBtn name="trash-outline" label={`Remover ${e.name}`} color={colors.danger} onPress={() => void run(() => repo.removeExercise(planId, e.id))} />
                </View>
              </View>
            ))}
            <Button label="Adicionar exercício" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/exercises', params: { planId, dayId: day.id } })} />
            {plan.days.length > 1 && (
              <Button compact label="Remover este dia" variant="danger" onPress={() => Alert.alert('Remover dia', `Remover "${day.name}" e os seus exercícios?`, [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Remover', style: 'destructive', onPress: () => void run(() => repo.deleteDay(planId, day.id)) }])} />
            )}
            </>}
          </Card>
        ); })}
        <Button label="Adicionar dia" icon="calendar-outline" variant="secondary" onPress={() => void run(() => repo.addDay(planId, ''))} />
      </ScrollView>

      <ExerciseConfigModal
        visible={!!editing} title={editing?.pe.name ?? ''} initial={editing ? repo.inferConfig(editing.pe) : repo.DEFAULT_CONFIG}
        onCancel={() => setEditing(null)}
        suggest={async (g, inc) => (editing ? (await suggestionFor(user.id, editing.pe.exerciseId, g, inc))?.weight ?? null : null)}
        onSave={async (c: ExerciseConfig) => { await run(() => repo.updateExercise(planId, editing!.pe.id, c)); setEditing(null); }} />
    </Screen>
  );
}
