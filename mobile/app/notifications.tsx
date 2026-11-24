import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { DEFAULT_PREFS, MAX_FOOD_REMINDERS, parseTime, type NotificationPrefs } from '@gym/shared';
import { AppText, Button, Card, Screen, ScreenHeader } from '../components/ui';
import { Chip, ChipRow, Field, Toggle } from '../components/form';
import { useAuth } from '../store/authStore';
import { getPrefs, savePrefs } from '../features/notifications/reminders';
import { applyReminders, permissionGranted, sendTestNotification } from '../services/notifications';
import { colors, spacing } from '../theme/tokens';

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function NotificationsScreen() {
  const user = useAuth((s) => s.user)!;
  const [p, setP] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [times, setTimes] = useState({ workout: '', weigh: '', food: '' });
  const [granted, setGranted] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { void (async () => {
    const cur = await getPrefs(user.id); setP(cur); setTimes({ workout: cur.workout.time, weigh: cur.weighIn.time, food: cur.foodLog.times.join(', ') }); setGranted(await permissionGranted());
  })(); }, [user.id]));

  const errs = [
    p.workout.enabled && !parseTime(times.workout) ? 'Hora do lembrete de treino inválida (HH:MM).' : null,
    p.weighIn.enabled && !parseTime(times.weigh) ? 'Hora da pesagem inválida (HH:MM).' : null,
    p.foodLog.enabled && times.food.split(',').map((s) => s.trim()).filter(Boolean).some((s) => !parseTime(s)) ? 'Horas do registo alimentar inválidas (ex.: 13:00, 20:30).' : null,
  ].filter(Boolean) as string[];

  const save = async () => {
    const next: NotificationPrefs = { ...p, workout: { ...p.workout, time: times.workout }, weighIn: { ...p.weighIn, time: times.weigh }, foodLog: { ...p.foodLog, times: times.food.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_FOOD_REMINDERS) } };
    const clean = await savePrefs(user.id, next); setP(clean);
    const n = await applyReminders(user.id); setGranted(await permissionGranted());
    setMsg(n > 0 ? `Guardado. ${n} lembrete(s) agendado(s).` : 'Guardado.');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Notificações" />
        {granted === false && <Card style={{ borderColor: colors.warning }}><AppText>A permissão de notificações não está concedida. Será pedida quando ativares um lembrete ou o aviso de descanso.</AppText></Card>}
        <AppText variant="small" muted>Todas as notificações são locais (agendadas no telemóvel). Por defeito só o aviso de descanso está ativo, para não receberes notificações em excesso.</AppText>

        <Card style={{ gap: spacing.sm }}>
          <Toggle label="Fim do descanso entre séries" value={p.restTimer} onChange={(v) => setP({ ...p, restTimer: v })} />
          <AppText variant="small" muted>Avisa-te com o ecrã bloqueado ou noutra app. Em alguns telemóveis a poupança de bateria pode atrasar o aviso.</AppText>
        </Card>
        <Card style={{ gap: spacing.sm }}>
          <Toggle label="Lembrete de treino" value={p.workout.enabled} onChange={(v) => setP({ ...p, workout: { ...p.workout, enabled: v } })} />
          {p.workout.enabled && <><Field label="Hora (HH:MM)" value={times.workout} onChangeText={(t) => setTimes({ ...times, workout: t })} keyboardType="numbers-and-punctuation" /><AppText variant="small" muted>Nos dias da semana definidos no teu plano ativo.</AppText></>}
        </Card>
        <Card style={{ gap: spacing.sm }}>
          <Toggle label="Lembrete de pesagem (semanal)" value={p.weighIn.enabled} onChange={(v) => setP({ ...p, weighIn: { ...p.weighIn, enabled: v } })} />
          {p.weighIn.enabled && <><ChipRow>{DAYS.map((d, i) => <Chip key={d} label={d} selected={p.weighIn.weekday === i + 1} onPress={() => setP({ ...p, weighIn: { ...p.weighIn, weekday: i + 1 } })} />)}</ChipRow><Field label="Hora (HH:MM)" value={times.weigh} onChangeText={(t) => setTimes({ ...times, weigh: t })} keyboardType="numbers-and-punctuation" /></>}
        </Card>
        <Card style={{ gap: spacing.sm }}>
          <Toggle label="Lembrete de registo alimentar (diário)" value={p.foodLog.enabled} onChange={(v) => setP({ ...p, foodLog: { ...p.foodLog, enabled: v } })} />
          {p.foodLog.enabled && <Field label={`Horas, separadas por vírgula (máx. ${MAX_FOOD_REMINDERS})`} value={times.food} onChangeText={(t) => setTimes({ ...times, food: t })} />}
        </Card>
        <Card style={{ gap: spacing.sm }}>
          <Toggle label="Aviso de inatividade" value={p.inactivity.enabled} onChange={(v) => setP({ ...p, inactivity: { ...p.inactivity, enabled: v } })} />
          {p.inactivity.enabled && <><AppText variant="small" muted>Um único aviso se passarem estes dias sem treinar:</AppText><ChipRow>{[3, 4, 5, 7, 10].map((d) => <Chip key={d} label={`${d} dias`} selected={p.inactivity.days === d} onPress={() => setP({ ...p, inactivity: { ...p.inactivity, days: d } })} />)}</ChipRow></>}
        </Card>

        {errs.map((e, i) => <AppText key={i} style={{ color: colors.danger }}>{e}</AppText>)}
        {msg ? <AppText style={{ color: colors.primary }}>{msg}</AppText> : null}
        <Button label="Guardar" disabled={errs.length > 0} onPress={() => void save()} />
        <Button label="Enviar notificação de teste" variant="secondary" onPress={async () => setMsg((await sendTestNotification()) ? 'Teste enviado (chega em 2 segundos).' : 'Sem permissão para notificações.')} />
      </ScrollView>
    </Screen>
  );
}
