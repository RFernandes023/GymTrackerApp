import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText, Button, Card, Screen, ScreenHeader } from '../components/ui';
import { useAuth } from '../store/authStore';
import { useSync } from '../store/syncStore';
import { keepBoth, keepMine, listConflicts, useServer, type Conflict } from '../features/sync/conflicts';
import { colors, spacing } from '../theme/tokens';
import { fmtDateTime } from '../utils/format';

const LABEL = { idle: 'Tudo sincronizado', syncing: 'A sincronizar…', offline: 'Sem ligação', error: 'Erro de sincronização', conflict: 'Precisa da tua decisão' } as const;

export default function SyncScreen() {
  const user = useAuth((s) => s.user)!;
  const s = useSync();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { await s.refresh(); setConflicts(await listConflicts(user.id)); }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const resolve = async (fn: () => Promise<unknown>) => { try { setError(null); await fn(); await reload(); void s.run(true); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <ScreenHeader title="Sincronização" />
        <Card style={{ gap: spacing.xs, borderColor: s.status === 'idle' ? colors.primary : s.status === 'conflict' ? colors.warning : colors.border }}>
          <AppText variant="h2">{LABEL[s.status]}</AppText>
          <AppText muted>{s.lastSyncAt ? `Última sincronização: ${fmtDateTime(s.lastSyncAt)}` : 'Ainda não sincronizou nesta sessão.'}</AppText>
          <AppText muted>Por enviar: {s.pending} · Bloqueadas: {s.blocked} · Conflitos: {s.conflicts}</AppText>
          {s.message ? <AppText style={{ color: colors.warning }}>{s.message}</AppText> : null}
          <AppText variant="small" muted>Os dados ficam sempre guardados no telemóvel primeiro. Sem internet tudo funciona e é enviado depois, com novas tentativas automáticas.</AppText>
        </Card>
        <Button label="Sincronizar agora" loading={s.status === 'syncing'} onPress={() => void s.run(true)} />
        {s.blocked > 0 && <AppText variant="small" style={{ color: colors.warning }}>{s.blocked} alteração(ões) foram recusadas pelo servidor (por exemplo, demasiado grandes) e não serão reenviadas.</AppText>}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}

        {conflicts.length > 0 && <AppText variant="h2">Planos alterados em dois dispositivos</AppText>}
        {conflicts.map((c) => (
          <Card key={c.id} style={{ gap: spacing.sm, borderColor: colors.warning }}>
            <AppText>Este plano foi alterado neste dispositivo e noutro ao mesmo tempo.</AppText>
            <AppText variant="small" muted>Neste dispositivo: “{c.localName}” · No servidor: {c.serverDeleted ? 'apagado' : `“${c.serverName}”`}</AppText>
            <Button label="Manter o meu" onPress={() => Alert.alert('Manter o meu', 'A versão deste dispositivo substitui a do servidor e dos outros dispositivos.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Manter o meu', onPress: () => void resolve(() => keepMine(user.id, c.id)) }])} />
            <Button label="Usar o do servidor" variant="secondary" onPress={() => Alert.alert('Usar o do servidor', 'As alterações feitas neste dispositivo a este plano serão perdidas.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Usar o do servidor', style: 'destructive', onPress: () => void resolve(() => useServer(user.id, c.id)) }])} />
            <Button label="Guardar o meu como cópia" variant="secondary" onPress={() => void resolve(() => keepBoth(user.id, c.id))} />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
