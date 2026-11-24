import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { toDateKey } from '@gym/shared';
import { AppText, Button, Card, Screen, ScreenHeader } from '../components/ui';
import { useAuth } from '../store/authStore';
import { exportByKind, exportPlan, type ExportKind } from '../features/exchange/exporters';
import { apiFetch } from '../services/api';
import { listPlans } from '../features/workouts/plansRepo';
import type { Plan } from '../features/workouts/types';
import { deleteTempImage } from '../services/tempFiles';
import { colors, spacing } from '../theme/tokens';

const KINDS: { kind: ExportKind; title: string; desc: string }[] = [
  { kind: 'plans', title: 'Todos os planos', desc: 'Formato oficial; cada plano pode ser importado de volta.' },
  { kind: 'custom_exercises', title: 'Exercícios personalizados', desc: 'Os exercícios que criaste.' },
  { kind: 'history', title: 'Histórico de treinos', desc: 'Sessões concluídas com séries, cargas e repetições.' },
  { kind: 'nutrition', title: 'Dados nutricionais e corporais', desc: 'Diário, objetivos, alimentos, receitas e medidas.' },
];

export default function ExportScreen() {
  const user = useAuth((s) => s.user)!;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { void listPlans(user.id).then(setPlans); }, [user.id]));

  const run = async (id: string, build: () => Promise<unknown>, fileBase: string, how: 'copy' | 'share') => {
    setBusy(id); setMsg(null);
    try {
      const text = JSON.stringify(await build(), null, 2);
      if (how === 'copy') { await Clipboard.setStringAsync(text); setMsg(`Copiado (${(text.length / 1024).toFixed(1)} KB).${text.length > 500_000 ? ' Ficheiro grande: prefere Partilhar ficheiro.' : ''}`); return; }
      if (!(await Sharing.isAvailableAsync())) { setMsg('A partilha de ficheiros não está disponível neste dispositivo. Usa Copiar.'); return; }
      const dir = `${FS.cacheDirectory}exports/`; await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const uri = `${dir}${fileBase}-${toDateKey(Date.now())}.json`;
      await FS.writeAsStringAsync(uri, text);
      try { await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Exportar' }); } finally { await deleteTempImage(uri); }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível exportar.'); }
    finally { setBusy(null); }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <ScreenHeader title="Exportar" />
        <AppText variant="small" muted>Ficheiros JSON versionados e documentados (docs/json-import-format.md). Os dados saem do dispositivo apenas para onde os partilhares.</AppText>
        {msg ? <Card style={{ borderColor: colors.accent }}><AppText>{msg}</AppText></Card> : null}

        <AppText variant="h2">Um plano</AppText>
        {plans.length === 0 && <AppText muted>Ainda não tens planos.</AppText>}
        {plans.map((p) => (
          <Card key={p.id} style={{ gap: spacing.sm }}>
            <AppText style={{ fontWeight: '600' }}>{p.name}</AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Button label="Copiar JSON" variant="secondary" loading={busy === `p-${p.id}`} onPress={() => void run(`p-${p.id}`, () => exportPlan(user.id, p.id), p.name.replace(/\W+/g, '-').toLowerCase(), 'copy')} /></View>
              <View style={{ flex: 1 }}><Button label="Partilhar" variant="secondary" onPress={() => void run(`p-${p.id}`, () => exportPlan(user.id, p.id), p.name.replace(/\W+/g, '-').toLowerCase(), 'share')} /></View>
            </View>
          </Card>
        ))}

        <AppText variant="h2">Backup da cloud (RGPD)</AppText>
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="small" muted>Descarrega tudo o que está guardado na tua conta no servidor (requer internet).</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Button label="Copiar" variant="secondary" loading={busy === 'cloud'} onPress={() => void run('cloud', () => apiFetch('/me/export'), 'cloud-backup', 'copy')} /></View>
            <View style={{ flex: 1 }}><Button label="Partilhar ficheiro" variant="secondary" onPress={() => void run('cloud', () => apiFetch('/me/export'), 'cloud-backup', 'share')} /></View>
          </View>
        </Card>

        <AppText variant="h2">Tudo o resto</AppText>
        {KINDS.map((k) => (
          <Card key={k.kind} style={{ gap: spacing.sm }}>
            <AppText style={{ fontWeight: '600' }}>{k.title}</AppText>
            <AppText variant="small" muted>{k.desc}</AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Button label="Copiar" variant="secondary" loading={busy === k.kind} onPress={() => void run(k.kind, () => exportByKind(user.id, k.kind), k.kind, 'copy')} /></View>
              <View style={{ flex: 1 }}><Button label="Partilhar ficheiro" variant="secondary" onPress={() => void run(k.kind, () => exportByKind(user.id, k.kind), k.kind, 'share')} /></View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
