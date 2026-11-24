import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Vibration, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { SET_TYPE_LABELS, elapsedMs, formatDuration, formatWeight, isStagnant, remainingMs, suggestDoubleProgression, type Progression, type SetType } from '@gym/shared';
import { AppText, Button, Card, EmptyState, IconButton, ListGroup, ListRow, Screen, Sheet } from '../../components/ui';
import { Chip, ChipRow, Stepper } from '../../components/form';
import { ExerciseImage } from '../../components/ExerciseImage';
import { confirmDiscard } from '../../components/ActiveWorkoutCard';
import { useAuth } from '../../store/authStore';
import * as repo from '../../features/workouts/sessionsRepo';
import { getExercise } from '../../features/workouts/exercisesRepo';
import { MUSCLE_LABELS, type Exercise, type Session, type SessionSet } from '../../features/workouts/types';
import { colors, MIN_TOUCH, radius, spacing } from '../../theme/tokens';
import { useNow } from '../../utils/useNow';
import { fmtDate } from '../../utils/format';
import { cancelRest, scheduleRest } from '../../services/notifications';
import { RestRing } from '../../components/RestRing';
import { ProgressBar } from '../../components/Progress';
import { successHaptic } from '../../utils/haptics';

interface Hint { exercise: Exercise | null; last: repo.LastPerformance | null; progression: Progression | null; stagnant: boolean }

/** O botão do fundo muda de função (iniciar → concluir → saltar): ignora o segundo toque acidental. */
const GUARD_MS = process.env.NODE_ENV === 'test' ? 0 : 700;

export default function ActiveWorkout() {
  useKeepAwake();
  const user = useAuth((s) => s.user)!;
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, Hint>>({});
  const [sheet, setSheet] = useState<'menu' | 'set' | 'exercises' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastTap = useRef(Date.now());
  const restHandled = useRef<number | null>(null);
  const now = useNow(250, true);

  const reload = useCallback(async () => {
    const id = await repo.getActiveSessionId(user.id);
    setSession(id ? await repo.getSession(id) : null);
    setLoaded(true);
  }, [user.id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  useEffect(() => { if (loaded && !session) router.replace('/(tabs)/workout'); }, [loaded, session]);

  // sugestões (double progression) + histórico + estagnação, calculados por exercício
  useEffect(() => {
    if (!session) return;
    for (const e of session.exercises) {
      if (hints[e.id]) continue;
      void (async () => {
        const [exercise, last, bests] = await Promise.all([getExercise(e.exerciseId), repo.lastPerformance(user.id, e.exerciseId, session.id), repo.bestsByExercise(user.id, e.exerciseId)]);
        const progression = last ? suggestDoubleProgression({ lastSets: last.sets, repMin: e.repMin, repMax: e.repMax, increment: e.weightIncrement }) : null;
        setHints((h) => ({ ...h, [e.id]: { exercise, last, progression, stagnant: isStagnant(bests) } }));
      })();
    }
  }, [session, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // aviso do fim do descanso com o ecrã bloqueado: segue sempre o `restEndsAt` guardado (saltar/ajustar/terminar reagendam ou cancelam)
  useEffect(() => {
    if (!session) return;
    if (session.restEndsAt && session.restEndsAt > Date.now()) void scheduleRest(user.id, session.restEndsAt).catch(() => {});
    else void cancelRest();
  }, [session?.restEndsAt, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // fim do descanso (por timestamp): vibra e liberta a próxima série
  useEffect(() => {
    if (!session?.restEndsAt || now < session.restEndsAt || restHandled.current === session.restEndsAt) return;
    restHandled.current = session.restEndsAt;
    Vibration.vibrate([0, 300, 150, 300]); successHaptic();
    void repo.endRest(session.id).then(reload);
  }, [now, session, reload]);

  if (!session) return <Screen><View style={{ padding: spacing.lg }}><AppText muted>A carregar…</AppText></View></Screen>;

  const target = repo.currentTarget(session);
  const focused = session.exercises.find((e) => e.id === (focusedId ?? target?.exerciseId)) ?? session.exercises.at(-1);
  const pos = focused ? session.exercises.indexOf(focused) : -1;
  const selected = focused?.sets.find((s) => s.id === selectedSetId && !s.completed) ?? focused?.sets.find((s) => !s.completed);
  const hint = focused ? hints[focused.id] : undefined;
  const resting = session.restEndsAt !== null && now < session.restEndsAt;
  const allSets = session.exercises.flatMap((e) => e.sets);
  const doneSets = allSets.filter((x) => x.completed).length;
  const act = async (fn: () => Promise<unknown>) => { try { setError(null); await fn(); await reload(); } catch (e) { setError(e instanceof Error && e.message === 'reps_required' ? 'Indica pelo menos 1 repetição.' : 'Não foi possível guardar. Tenta novamente.'); } };

  const patch = (set: SessionSet, p: { weight?: number; reps?: number; rir?: number | null; rpe?: number | null }) => act(() => repo.updateSet(set.id, p));
  const guarded = (fn: () => unknown) => { if (Date.now() - lastTap.current < GUARD_MS) return; lastTap.current = Date.now(); void fn(); };
  const complete = () => selected && act(async () => { await repo.completeSet(session.id, selected.id); successHaptic(); setFocusedId(null); setSelectedSetId(null); });
  const goTo = (id: string) => { setFocusedId(id); setSelectedSetId(null); setSheet(null); };
  const leave = () => router.dismissTo('/(tabs)/workout');
  const addExercise = () => { setSheet(null); router.push({ pathname: '/exercises', params: { sessionId: session.id } }); };
  const discard = () => { setSheet(null); confirmDiscard(session.id, () => router.dismissTo('/(tabs)/workout')); };

  const applySuggestion = () => focused && hint?.progression && act(async () => {
    for (const s of focused.sets.filter((x) => !x.completed && (x.type === 'working' || x.type === 'failure'))) await repo.updateSet(s.id, { weight: hint.progression!.suggestedWeight, reps: hint.progression!.suggestedReps });
  });

  const finish = () => {
    if (doneSets === 0) { discard(); return; }
    const pending = allSets.length - doneSets;
    Alert.alert('Terminar treino?', pending > 0 ? `${pending} série(s) por fazer serão descartadas.` : 'Guardar e ver o resumo.', [
      { text: 'Continuar', style: 'cancel' },
      { text: 'Terminar', onPress: async () => { try { await repo.finishSession(user.id, session.id); await cancelRest(); router.replace({ pathname: '/workout/summary/[id]', params: { id: session.id } }); } catch { setError('Não foi possível terminar o treino.'); } } }]);
  };
  const tapSet = (s: SessionSet) => s.completed
    ? Alert.alert('Série concluída', 'Desfazer a conclusão desta série?', [{ text: 'Não', style: 'cancel' }, { text: 'Desfazer', onPress: () => void act(() => repo.undoSet(session.id, s.id)) }])
    : setSelectedSetId(s.id);

  const setIndex = selected && focused ? focused.sets.indexOf(selected) + 1 : 0;
  const nextPending = session.exercises.find((e) => e.id !== focused?.id && e.sets.some((x) => !x.completed));

  const footer = resting ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <RestRing remainingMs={remainingMs(session.restEndsAt!, now)} totalMs={session.restTotalMs ?? 0} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <AppText variant="small" muted>Descanso</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Button compact label="−15 s" variant="secondary" onPress={() => void act(() => repo.adjustRest(session.id, -15))} /></View>
          <View style={{ flex: 1 }}><Button compact label="+15 s" variant="secondary" onPress={() => void act(() => repo.adjustRest(session.id, 15))} /></View>
          <View style={{ flex: 1.2 }}><Button compact label="Saltar" onPress={() => guarded(() => act(() => repo.endRest(session.id)))} /></View>
        </View>
      </View>
    </View>
  ) : session.exercises.length === 0 ? <Button label="Adicionar exercício" icon="add" onPress={addExercise} />
    : selected ? <Button label="Concluir série" icon="checkmark" onPress={() => guarded(complete)} />
    : nextPending ? <Button label={`Seguinte: ${nextPending.name}`} onPress={() => goTo(nextPending.id)} />
    : <Button label="Terminar treino" icon="flag" onPress={finish} />;

  return (
    <Screen footer={<>{error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}{footer}</>}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <IconButton name="chevron-down" label="Minimizar treino" onPress={leave} />
          <View style={{ flex: 1 }}>
            <AppText variant="small" muted numberOfLines={1}>{session.name}</AppText>
            <AppText variant="h2" accessibilityLabel="Duração do treino" style={{ fontVariant: ['tabular-nums'] }}>{formatDuration(elapsedMs(session.startedAt, now))}</AppText>
          </View>
          <IconButton name="ellipsis-horizontal" label="Opções do treino" onPress={() => setSheet('menu')} />
          <Button compact label="Terminar" variant="secondary" onPress={finish} />
        </View>
        <View style={{ gap: 6 }}>
          <ProgressBar value={doneSets} max={allSets.length || null} color={colors.primary} label={`Progresso do treino: ${doneSets} de ${allSets.length} séries`} />
          <AppText variant="small" muted>{doneSets} de {allSets.length} séries concluídas</AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        {!focused ? <EmptyState icon="barbell-outline" title="Treino livre" text="Adiciona o primeiro exercício para começar a registar séries." /> : (
          <>
            {session.exercises.length > 1 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {pos > 0 ? <IconButton name="chevron-back" label="Exercício anterior" onPress={() => goTo(session.exercises[pos - 1]!.id)} /> : <View style={{ width: MIN_TOUCH }} />}
                <Pressable accessibilityRole="button" accessibilityLabel="Ver todos os exercícios" onPress={() => setSheet('exercises')} style={{ flex: 1, minHeight: MIN_TOUCH, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <AppText style={{ fontWeight: '600' }}>Exercício {pos + 1} de {session.exercises.length}</AppText>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </Pressable>
                {pos < session.exercises.length - 1 ? <IconButton name="chevron-forward" label="Exercício seguinte" onPress={() => goTo(session.exercises[pos + 1]!.id)} /> : <View style={{ width: MIN_TOUCH }} />}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <ExerciseImage exercise={hint?.exercise ?? null} size={84} animated />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="h2">{focused.name}</AppText>
                <AppText variant="small" muted>{[hint?.exercise?.primary.map((m) => MUSCLE_LABELS[m]).join(', '), `${focused.repMin}–${focused.repMax} reps`, focused.supersetGroup ? 'superset' : null].filter(Boolean).join(' · ')}</AppText>
                <AppText variant="small" muted>{hint?.last ? `${fmtDate(hint.last.performedAt)}: ${hint.last.sets.filter((s) => s.type !== 'warmup').map((s) => `${formatWeight(s.weight)}×${s.reps}`).join('  ')}` : 'Primeira vez: ajusta a carga à vontade.'}</AppText>
              </View>
            </View>

            {hint?.progression && hint.progression.kind !== 'hold' && (
              <Card style={{ gap: spacing.sm, padding: spacing.md }}>
                <AppText variant="small">{hint.progression.message}</AppText>
                <Button compact label={`Aplicar ${formatWeight(hint.progression.suggestedWeight)} kg × ${hint.progression.suggestedReps}`} variant="secondary" onPress={() => void applySuggestion()} />
              </Card>
            )}
            {hint?.progression?.kind === 'hold' && <AppText variant="small" muted>{hint.progression.message}</AppText>}
            {hint?.stagnant && <AppText variant="small" style={{ color: colors.warning }}>Sem progresso nas últimas 3 sessões. Experimenta variar o descanso ou o volume.</AppText>}

            <View style={{ gap: spacing.sm }}>
              {focused.sets.map((s, i) => {
                const isSel = s.id === selected?.id;
                return (
                  <View key={s.id} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: isSel ? 2 : 1, borderColor: isSel ? colors.primary : colors.border }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Série ${i + 1}, ${formatWeight(s.weight)} kg, ${s.reps} repetições${s.completed ? ', concluída' : ''}`} accessibilityState={{ selected: isSel }} onPress={() => tapSet(s)}
                      style={{ minHeight: 52, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <Ionicons name={s.completed ? 'checkmark-circle' : isSel ? 'radio-button-on' : 'ellipse-outline'} size={24} color={s.completed || isSel ? colors.primary : colors.textMuted} />
                      <AppText style={{ flex: 1, fontWeight: '600' }}>{i + 1}{s.type !== 'working' ? <AppText variant="small" muted>  {SET_TYPE_LABELS[s.type]}</AppText> : null}</AppText>
                      <AppText muted={!s.completed && !isSel}>{formatWeight(s.weight)} kg × {s.reps}{s.rir != null ? ` · RIR ${s.rir}` : ''}{s.rpe != null ? ` · RPE ${s.rpe}` : ''}</AppText>
                    </Pressable>
                    {isSel && (
                      <View style={{ gap: spacing.md, padding: spacing.md, paddingTop: 0 }}>
                        <Stepper big label="Peso (kg)" value={s.weight} step={focused.weightIncrement} onChange={(v) => void patch(s, { weight: v })} />
                        <Stepper big label="Repetições" value={s.reps} step={1} min={0} max={200} format={(n) => String(Math.round(n))} onChange={(v) => void patch(s, { reps: v })} />
                        <Button compact variant="ghost" icon="options-outline" label="Esforço e outras opções" onPress={() => setSheet('set')} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <Button compact label="Adicionar série" icon="add" variant="secondary" onPress={() => void act(() => repo.addExtraSet(focused.id, 'working'))} />
          </>
        )}
      </ScrollView>

      <Sheet visible={sheet === 'menu'} title="Opções do treino" onClose={() => setSheet(null)}>
        <ListGroup>
          <ListRow icon="add" title="Adicionar exercício" onPress={addExercise} />
          <ListRow icon="list-outline" color={colors.accent} title="Ver todos os exercícios" onPress={() => setSheet('exercises')} />
          <ListRow icon="trash-outline" danger title="Descartar treino" sub="Apaga este treino sem o guardar" onPress={discard} />
        </ListGroup>
      </Sheet>

      <Sheet visible={sheet === 'exercises'} title="Exercícios" onClose={() => setSheet(null)} footer={<Button label="Adicionar exercício" icon="add" variant="secondary" onPress={addExercise} />}>
        <ListGroup>
          {session.exercises.map((e) => {
            const d = e.sets.filter((s) => s.completed).length;
            return <ListRow key={e.id} icon={d === e.sets.length ? 'checkmark' : 'barbell-outline'} color={d === e.sets.length ? colors.primary : colors.accent} title={e.name} sub={`${d} de ${e.sets.length} séries${e.supersetGroup ? ' · superset' : ''}`} onPress={() => goTo(e.id)} />;
          })}
        </ListGroup>
      </Sheet>

      <Sheet visible={sheet === 'set' && !!selected} title={`Série ${setIndex}`} onClose={() => setSheet(null)} footer={<Button label="Pronto" onPress={() => setSheet(null)} />}>
        {selected && focused && (
          <>
            <AppText variant="small" muted>RIR: repetições que ainda conseguias fazer (opcional)</AppText>
            <ChipRow><Chip label="—" selected={selected.rir === null} onPress={() => void patch(selected, { rir: null })} />{[0, 1, 2, 3, 4].map((r) => <Chip key={r} label={String(r)} selected={selected.rir === r} onPress={() => void patch(selected, { rir: r })} />)}</ChipRow>
            <AppText variant="small" muted>RPE: esforço de 6 a 10 (opcional)</AppText>
            <ChipRow><Chip label="—" selected={selected.rpe === null} onPress={() => void patch(selected, { rpe: null })} />{[6, 7, 8, 9, 10].map((r) => <Chip key={r} label={String(r)} selected={selected.rpe === r} onPress={() => void patch(selected, { rpe: r })} />)}</ChipRow>
            <AppText variant="small" muted>Adicionar outra série</AppText>
            <ChipRow>{(['drop', 'rest_pause', 'failure', 'warmup'] as SetType[]).map((t) => <Chip key={t} label={`+ ${SET_TYPE_LABELS[t]}`} onPress={() => { setSheet(null); void act(() => repo.addExtraSet(focused.id, t)); }} />)}</ChipRow>
            <Button compact variant="danger" icon="trash-outline" label="Remover esta série" onPress={() => { setSheet(null); void act(() => repo.removeSet(selected.id)); }} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
