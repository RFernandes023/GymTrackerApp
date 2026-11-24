import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SET_TYPE_LABELS, formatDuration, formatWeight } from '@gym/shared';
import { AppText, Button, Card, Screen } from '../../../components/ui';
import { useAuth } from '../../../store/authStore';
import { deleteSession, getSession } from '../../../features/workouts/sessionsRepo';
import type { Session } from '../../../features/workouts/types';
import { colors, spacing } from '../../../theme/tokens';
import { fmtDateTime, fmtKg, fmtNumber } from '../../../utils/format';
import { applyReminders } from '../../../services/notifications';

function Metric({ label, value, delta }: { label: string; value: string; delta?: string | null }) {
  return (
    <Card style={{ flex: 1, minWidth: '45%', gap: 2 }}>
      <AppText variant="small" muted>{label}</AppText>
      <AppText variant="h2">{value}</AppText>
      {delta ? <AppText variant="small" style={{ color: delta.startsWith('+') ? colors.primary : colors.textMuted }}>{delta} vs. sessão anterior</AppText> : null}
    </Card>
  );
}
const diff = (cur: number, prev: number | undefined, fmt: (n: number) => string) => (prev === undefined ? null : `${cur - prev >= 0 ? '+' : '−'}${fmt(Math.abs(cur - prev))}`);

export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user)!;
  const [s, setS] = useState<Session | null>(null);
  useEffect(() => { void getSession(String(id)).then(setS); void applyReminders(user.id).catch(() => {}); }, [id]); // reagenda o aviso de inatividade
  if (!s?.summary) return <Screen><View style={{ padding: spacing.lg }}><AppText muted>A carregar…</AppText></View></Screen>;
  const sum = s.summary, prev = sum.previous;

  return (
    <Screen footer={<Button label="Concluído" onPress={() => router.canGoBack?.() ? router.back() : router.replace('/(tabs)/workout')} />}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
        <AppText variant="title">Treino concluído</AppText>
        <AppText muted>{s.name} · {fmtDateTime(s.completedAt ?? s.startedAt)}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <Metric label="Duração" value={formatDuration(sum.durationMs)} delta={diff(sum.durationMs, prev?.durationMs, (n) => formatDuration(n))} />
          <Metric label="Volume total" value={fmtKg(sum.volume)} delta={diff(sum.volume, prev?.volume, (n) => fmtKg(n))} />
          <Metric label="Séries" value={String(sum.setsDone)} delta={diff(sum.setsDone, prev?.sets, (n) => String(n))} />
          <Metric label="Repetições" value={fmtNumber(sum.totalReps)} />
          <Metric label="Exercícios" value={String(sum.exercisesDone)} />
        </View>
        {sum.records.length > 0 && (
          <Card style={{ gap: spacing.xs, borderColor: colors.primary }}>
            <AppText variant="h2" style={{ color: colors.primary }}>Recordes pessoais</AppText>
            {sum.records.map((r, i) => <AppText key={i}>{r.exerciseName}: {r.kind === 'weight' ? `carga máxima ${formatWeight(r.value)} kg` : `1RM estimado ${formatWeight(r.value)} kg`}</AppText>)}
            <AppText variant="small" muted>O 1RM é uma estimativa (fórmula de Epley).</AppText>
          </Card>
        )}
        {!prev && <AppText variant="small" muted>Primeira sessão deste treino: sem comparação disponível.</AppText>}
        {s.exercises.map((e) => {
          const t0 = Math.min(...e.sets.map((x) => x.startedAt ?? Infinity)), t1 = Math.max(...e.sets.map((x) => x.completedAt ?? 0));
          return (
            <Card key={e.id} style={{ gap: spacing.xs }}>
              <AppText style={{ fontWeight: '600' }}>{e.name}{Number.isFinite(t0) && t1 > t0 ? ` · ${formatDuration(t1 - t0)}` : ''}</AppText>
              {e.sets.map((x, i) => <AppText key={x.id} muted>{i + 1}. {formatWeight(x.weight)} kg × {x.reps}{x.type !== 'working' ? ` (${SET_TYPE_LABELS[x.type]})` : ''}{x.rir != null ? ` · RIR ${x.rir}` : ''}</AppText>)}
            </Card>
          );
        })}
        <Button compact icon="trash-outline" label="Eliminar este registo" variant="danger" onPress={() => Alert.alert('Eliminar registo', 'Apagar este treino do histórico?', [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteSession(user.id, s.id); if (router.canGoBack?.()) router.back(); else router.replace('/(tabs)/workout'); } }])} />
      </ScrollView>
    </Screen>
  );
}
