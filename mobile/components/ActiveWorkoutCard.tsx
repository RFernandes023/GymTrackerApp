import React from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { elapsedMs, formatDuration } from '@gym/shared';
import { AppText, Button, Card } from './ui';
import { discardSession } from '../features/workouts/sessionsRepo';
import { cancelRest } from '../services/notifications';
import type { Session } from '../features/workouts/types';
import { colors, spacing } from '../theme/tokens';
import { fmtDateTime } from '../utils/format';

const STALE_MS = 3 * 3600_000;

/** Pergunta e apaga o treino em curso. */
export function confirmDiscard(sessionId: string, onDone: () => void) {
  Alert.alert('Descartar treino?', 'As séries registadas neste treino são apagadas. Não dá para desfazer.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Descartar', style: 'destructive', onPress: async () => { await discardSession(sessionId); await cancelRest(); onDone(); } },
  ]);
}

/** Treino por terminar: nunca é aberto sozinho, só ao tocar em "Retomar treino". */
export function ActiveWorkoutCard({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const all = session.exercises.flatMap((e) => e.sets);
  const ms = elapsedMs(session.startedAt, Date.now());
  const stale = ms > STALE_MS;
  return (
    <Card style={{ gap: spacing.md, borderColor: stale ? colors.warning : colors.primary }}>
      <View style={{ gap: 2 }}>
        <AppText variant="small" style={{ color: stale ? colors.warning : colors.primary, fontWeight: '700' }}>{stale ? 'Ficou um treino por terminar' : 'Treino em curso'}</AppText>
        <AppText variant="h2">{session.name}</AppText>
        <AppText variant="small" muted>{stale ? `Iniciado a ${fmtDateTime(session.startedAt)}` : `Há ${formatDuration(ms)}`} · {all.filter((x) => x.completed).length} de {all.length} séries</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Button compact variant="danger" label="Descartar" onPress={() => confirmDiscard(session.id, onChanged)} /></View>
        <View style={{ flex: 1.6 }}><Button compact icon="play" label="Retomar treino" onPress={() => router.push('/workout/active')} /></View>
      </View>
    </Card>
  );
}
