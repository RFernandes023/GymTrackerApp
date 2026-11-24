import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Vibration, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { SET_TYPE_LABELS, elapsedMs, formatDuration, formatWeight, isStagnant, remainingMs, suggestDoubleProgression, type Progression, type SetType } from '@gym/shared';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { Chip, ChipRow, Stepper } from '../../components/form';
import { ExerciseImage } from '../../components/ExerciseImage';
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
import { successHaptic, warnHaptic } from '../../utils/haptics';

interface Hint { exercise: Exercise | null; last: repo.LastPerformance | null; progression: Progression | null; stagnant: boolean }

export default function ActiveWorkout() {
  useKeepAwake();
  const user = useAuth((s) => s.user)!;
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, Hint>>({});
  const [showEffort, setShowEffort] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const focused = session.exercises.find((e) => e.id === (focusedId ?? target?.exerciseId)) ?? session.exercises[0];
  const firstPending = focused?.sets.find((s) => !s.completed);
  const selected = focused?.sets.find((s) => s.id === selectedSetId) ?? firstPending;
  const hint = focused ? hints[focused.id] : undefined;
  const resting = session.restEndsAt !== null && now < session.restEndsAt;
  const allSets = session.exercises.flatMap((e) => e.sets);
  const doneSets = allSets.filter((x) => x.completed).length;
  const act = async (fn: () => Promise<unknown>) => { try { setError(null); await fn(); await reload(); } catch (e) { setError(e instanceof Error && e.message === 'reps_required' ? 'Indica pelo menos 1 repetição.' : 'Não foi possível guardar. Tenta novamente.'); } };

  const patch = (set: SessionSet, p: { weight?: number; reps?: number; rir?: number | null; rpe?: number | null }) => act(() => repo.updateSet(set.id, p));
  const complete = () => selected && act(async () => { await repo.completeSet(session.id, selected.id); successHaptic(); setFocusedId(null); setSelectedSetId(null); });

  const applySuggestion = () => focused && hint?.progression && act(async () => {
    for (const s of focused.sets.filter((x) => !x.completed && (x.type === 'working' || x.type === 'failure'))) await repo.updateSet(s.id, { weight: hint.progression!.suggestedWeight, reps: hint.progression!.suggestedReps });
  });

  const finish = async () => {
    const all = session.exercises.flatMap((e) => e.sets);
    const done = all.filter((s) => s.completed).length;
    if (done === 0) {
      Alert.alert('Nenhuma série concluída', 'Queres descartar este treino?', [
        { text: 'Continuar treino', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: async () => { await repo.discardSession(session.id); await cancelRest(); router.replace('/(tabs)/workout'); } }]);
      return;
    }
    const pending = all.length - done;
    Alert.alert('Terminar treino?', pending > 0 ? `${pending} série(s) por fazer serão descartadas.` : 'Guardar e ver o resumo.', [
      { text: 'Continuar', style: 'cancel' },
      { text: 'Terminar', onPress: async () => { try { await repo.finishSession(user.id, session.id); await cancelRest(); router.replace({ pathname: '/workout/summary/[id]', params: { id: session.id } }); } catch { setError('Não foi possível terminar o treino.'); } } }]);
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="small" muted numberOfLines={1}>{session.name}</AppText>
            <AppText variant="title" accessibilityLabel="Duração do treino">{formatDuration(elapsedMs(session.startedAt, now))}</AppText>
          </View>
          <View><Button label="Terminar" onPress={() => void finish()} /></View>
        </View>
        <View style={{ gap: 4 }}>
          <ProgressBar value={doneSets} max={allSets.length || null} color={colors.primary} label={`Progresso do treino: ${doneSets} de ${allSets.length} séries`} />
          <AppText variant="small" muted>{doneSets} de {allSets.length} séries concluídas</AppText>
        </View>
        {resting && (
          <Card style={{ gap: spacing.sm, borderColor: colors.accent }}>
            <RestRing remainingMs={remainingMs(session.restEndsAt!, now)} totalMs={session.restTotalMs ?? 0} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Button label="−15 s" variant="secondary" onPress={() => void act(() => repo.adjustRest(session.id, -15))} /></View>
              <View style={{ flex: 1 }}><Button label="+15 s" variant="secondary" onPress={() => void act(() => repo.adjustRest(session.id, 15))} /></View>
              <View style={{ flex: 1.4 }}><Button label="Saltar" onPress={() => void act(() => repo.endRest(session.id))} /></View>
            </View>
          </Card>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <ChipRow>
          {session.exercises.map((e) => (
            <Chip key={e.id} selected={e.id === focused?.id} label={`${e.supersetGroup ? '⛓ ' : ''}${e.name.length > 18 ? e.name.slice(0, 17) + '…' : e.name} ${e.sets.filter((s) => s.completed).length}/${e.sets.length}`}
              onPress={() => { setFocusedId(e.id); setSelectedSetId(null); }} />
          ))}
          <Chip label="+ Exercício" onPress={() => router.push({ pathname: '/exercises', params: { sessionId: session.id } })} />
        </ChipRow>

        {!focused ? <AppText muted>Treino livre: adiciona o primeiro exercício.</AppText> : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <ExerciseImage exercise={hint?.exercise ?? null} size={96} animated />
              <View style={{ flex: 1 }}>
                <AppText variant="h2">{focused.name}</AppText>
                <AppText muted>{hint?.exercise?.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}</AppText>
                <AppText variant="small" muted>Objetivo: {focused.repMin}–{focused.repMax} reps · +{formatWeight(focused.weightIncrement)} kg</AppText>
              </View>
            </View>

            {hint?.last ? (
              <Card style={{ gap: spacing.xs }}>
                <AppText variant="small" muted>Última sessão ({fmtDate(hint.last.performedAt)})</AppText>
                <AppText>{hint.last.sets.filter((s) => s.type !== 'warmup').map((s) => `${formatWeight(s.weight)}×${s.reps}`).join('  ·  ')}</AppText>
              </Card>
            ) : <AppText variant="small" muted>Sem histórico deste exercício: os valores iniciais vêm do plano ou de uma estimativa para o teu perfil. Ajusta à vontade.</AppText>}

            {hint?.progression && hint.progression.kind !== 'hold' && (
              <Card style={{ gap: spacing.sm, borderColor: colors.primary }}>
                <AppText variant="small" style={{ color: colors.primary }}>Sugestão (nunca aplicada automaticamente)</AppText>
                <AppText>{hint.progression.message}</AppText>
                <Button label={`Aplicar ${formatWeight(hint.progression.suggestedWeight)} kg × ${hint.progression.suggestedReps}`} variant="secondary" onPress={() => void applySuggestion()} />
              </Card>
            )}
            {hint?.progression?.kind === 'hold' && <AppText variant="small" muted>{hint.progression.message}</AppText>}
            {hint?.stagnant && <AppText variant="small" style={{ color: colors.warning }}>Sem progresso nas últimas 3 sessões neste exercício. Considera variar o estímulo, descanso ou volume.</AppText>}

            {focused.sets.map((s, i) => {
              const isSel = s.id === selected?.id;
              return (
                <Pressable key={s.id} accessibilityRole="button" onPress={() => s.completed ? Alert.alert('Série concluída', 'Desfazer a conclusão desta série?', [{ text: 'Não', style: 'cancel' }, { text: 'Desfazer', onPress: () => void act(() => repo.undoSet(session.id, s.id)) }]) : setSelectedSetId(s.id)}
                  style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: isSel ? colors.primary : colors.border, padding: spacing.md, gap: spacing.md, opacity: s.completed ? 0.75 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText style={{ fontWeight: '600' }}>Série {i + 1} · {SET_TYPE_LABELS[s.type]}{s.isExtra ? ' (extra)' : ''}</AppText>
                    {s.completed ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : <AppText muted>{formatWeight(s.weight)} kg × {s.reps}</AppText>}
                  </View>
                  {s.completed && <AppText muted>{formatWeight(s.weight)} kg × {s.reps}{s.rir != null ? ` · RIR ${s.rir}` : ''}{s.rpe != null ? ` · RPE ${s.rpe}` : ''}{s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ''}</AppText>}
                  {isSel && !s.completed && (
                    <View style={{ gap: spacing.md }}>
                      <Stepper big label="Peso (kg)" value={s.weight} step={focused.weightIncrement} onChange={(v) => void patch(s, { weight: v })} />
                      <Stepper big label="Repetições" value={s.reps} step={1} min={0} max={200} format={(n) => String(Math.round(n))} onChange={(v) => void patch(s, { reps: v })} />
                      <Pressable onPress={() => setShowEffort(!showEffort)}><AppText variant="small" style={{ color: colors.accent }}>{showEffort ? 'Ocultar esforço' : 'Registar esforço (RIR/RPE, opcional)'}</AppText></Pressable>
                      {showEffort && (
                        <View style={{ gap: spacing.xs }}>
                          <AppText variant="small" muted>RIR (reps em reserva)</AppText>
                          <ChipRow><Chip label="—" selected={s.rir === null} onPress={() => void patch(s, { rir: null })} />{[0, 1, 2, 3, 4].map((r) => <Chip key={r} label={String(r)} selected={s.rir === r} onPress={() => void patch(s, { rir: r })} />)}</ChipRow>
                          <AppText variant="small" muted>RPE (esforço percebido)</AppText>
                          <ChipRow><Chip label="—" selected={s.rpe === null} onPress={() => void patch(s, { rpe: null })} />{[6, 7, 8, 9, 10].map((r) => <Chip key={r} label={String(r)} selected={s.rpe === r} onPress={() => void patch(s, { rpe: r })} />)}</ChipRow>
                        </View>
                      )}
                      <Button label="Concluir série" onPress={() => void complete()} />
                      <Pressable accessibilityRole="button" onPress={() => void act(() => repo.removeSet(s.id))} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
                        <AppText variant="small" style={{ color: colors.danger }}>Remover esta série</AppText>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            })}

            <AppText variant="small" muted>Adicionar série extra</AppText>
            <ChipRow>
              {(['working', 'drop', 'rest_pause', 'failure', 'warmup'] as SetType[]).map((t) => <Chip key={t} label={`+ ${SET_TYPE_LABELS[t]}`} onPress={() => void act(() => repo.addExtraSet(focused.id, t))} />)}
            </ChipRow>
          </>
        )}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
      </ScrollView>
    </Screen>
  );
}
