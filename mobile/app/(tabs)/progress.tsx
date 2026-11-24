import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { filterRange, monthlyComparison, type Point } from '@gym/shared';
import { AppText, Button, Card, EmptyState, ListGroup, ListRow, Screen, SectionTitle, TabHeader } from '../../components/ui';
import { Chip, ChipRow } from '../../components/form';
import { LineChart } from '../../components/LineChart';
import { useAuth } from '../../store/authStore';
import { getBodyInfo } from '../../features/profile/profileRepo';
import { BUILTIN_METRICS, METRIC_LABELS, customMetricNames, listMeasurements, pointsFor, weeklySummary, type Measurement, type Metric, type WeeklySummary } from '../../features/progress/measurementsRepo';
import { colors, spacing } from '../../theme/tokens';
import { fmtDate, fmtKg, fmtNumber } from '../../utils/format';

const RANGES: [string, number | null][] = [['30 dias', 30], ['90 dias', 90], ['1 ano', 365], ['Tudo', null]];
const CHART_METRICS: Metric[] = ['weight', 'bmi', 'bodyFat', 'muscleMass', 'waist', 'chest', 'arms', 'forearms', 'thighs', 'calves'];
const metricName = (m: Metric) => (m.startsWith('custom:') ? m.slice(7) : METRIC_LABELS[m] ?? m);

/** Último valor conhecido de um indicador (o registo mais recente pode não incluir tudo). */
function lastKnown(list: Measurement[], metric: Metric) {
  for (const m of list) { const v = metric.startsWith('custom:') ? m.custom[metric.slice(7)] : (m as any)[metric]; if (typeof v === 'number') return { value: v, date: m.date, m }; }
  return null;
}
const sourceTag = (s: 'estimate' | 'measured' | null | undefined) => (s === 'estimate' ? 'estimativa' : s === 'measured' ? 'medido' : '');

export default function Progress() {
  const user = useAuth((s) => s.user)!;
  const [list, setList] = useState<Measurement[]>([]);
  const [hasProfile, setHasProfile] = useState(true);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [metric, setMetric] = useState<Metric>('weight');
  const [range, setRange] = useState<number | null>(90);

  useFocusEffect(useCallback(() => { void (async () => {
    setList(await listMeasurements(user.id, 500)); setHasProfile(!!(await getBodyInfo(user.id))); setWeekly(await weeklySummary(user.id));
  })(); }, [user.id]));

  const metrics = useMemo<Metric[]>(() => [...CHART_METRICS, ...customMetricNames(list).map((n) => `custom:${n}` as Metric)], [list]);
  const all = useMemo(() => pointsFor(list, metric), [list, metric]);
  const pts: Point[] = useMemo(() => filterRange(all, range, Date.now()), [all, range]);
  const month = useMemo(() => monthlyComparison(all, Date.now()), [all]);
  const fmt = (n: number) => (metric === 'bodyFat' ? `${fmtNumber(n)} %` : fmtNumber(n));
  const lw = lastKnown(list, 'weight'), lb = lastKnown(list, 'bmi'), lf = lastKnown(list, 'bodyFat'), lm = lastKnown(list, 'muscleMass'), lt = lastKnown(list, 'waist');

  /** Tocar num indicador mostra-o no gráfico. */
  const tile = (m: Metric, title: string, value: string, sub?: string) => (
    <Pressable key={m} accessibilityRole="button" accessibilityLabel={`${title}: ${value}`} accessibilityState={{ selected: metric === m }} onPress={() => setMetric(m)} style={{ flexGrow: 1, flexBasis: '46%' }}>
      <Card style={{ flex: 1, gap: 2, padding: spacing.md, borderColor: metric === m ? colors.primary : colors.border }}>
        <AppText variant="small" muted>{title}</AppText><AppText variant="h2" style={{ fontSize: 22 }}>{value}</AppText>{sub ? <AppText variant="small" muted>{sub}</AppText> : null}
      </Card>
    </Pressable>
  );

  return (
    <Screen tab>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <TabHeader title="Evolução"><Button compact icon="add" label="Novo registo" onPress={() => router.push('/progress/new')} /></TabHeader>

        {!hasProfile && (
          <Card style={{ gap: spacing.sm, borderColor: colors.warning }}>
            <AppText>Define o teu perfil (sexo, idade, altura) para calcular o IMC e as estimativas de gordura e músculo.</AppText>
            <Button compact label="Definir perfil" variant="secondary" onPress={() => router.push('/profile')} />
          </Card>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {tile('weight', 'Peso', lw ? fmtKg(lw.value) : '—', lw ? fmtDate(new Date(`${lw.date}T12:00:00`).getTime()) : 'Sem registos')}
          {tile('bmi', 'IMC', lb ? fmtNumber(lb.value) : '—', lb ? 'calculado automaticamente' : hasProfile ? undefined : 'Requer perfil')}
          {tile('bodyFat', 'Gordura corporal', lf ? `${fmtNumber(lf.value)} %` : '—', lf ? sourceTag(lf.m.bodyFatSource) : undefined)}
          {tile('muscleMass', 'Massa muscular', lm ? fmtKg(lm.value) : '—', lm ? sourceTag(lm.m.muscleSource) : undefined)}
          {tile('waist', 'Cintura', lt ? `${fmtNumber(lt.value)} cm` : '—')}
        </View>
        {(lf?.m.bodyFatSource === 'estimate' || lm?.m.muscleSource === 'estimate') && (
          <AppText variant="small" muted>Gordura e músculo “estimativa” são aproximações por fórmulas. Se tiveres medições reais, adiciona-as num novo registo.</AppText>
        )}

        <SectionTitle>Gráfico</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <ChipRow>{metrics.map((m) => <Chip key={m} label={metricName(m)} selected={metric === m} onPress={() => setMetric(m)} />)}</ChipRow>
          <ChipRow>{RANGES.map(([l, d]) => <Chip key={l} label={l} selected={range === d} onPress={() => setRange(d)} />)}</ChipRow>
          <LineChart points={pts} title={metricName(metric)} format={fmt} />
          {pts.length >= 2 && <AppText variant="small" muted>{fmt(pts[0]!.value)} → {fmt(pts.at(-1)!.value)} ({pts.at(-1)!.value - pts[0]!.value >= 0 ? '+' : '−'}{fmt(Math.abs(pts.at(-1)!.value - pts[0]!.value))}) neste período</AppText>}
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <AppText variant="h2">{metricName(metric)} por mês</AppText>
          {month.current === null && month.previous === null ? <AppText muted>Sem registos neste e no mês anterior.</AppText> : (
            <>
              <AppText>Este mês: {month.current !== null ? `${fmt(month.current)} (média de ${month.nCurrent})` : '—'}</AppText>
              <AppText>Mês anterior: {month.previous !== null ? `${fmt(month.previous)} (média de ${month.nPrevious})` : '—'}</AppText>
              {month.delta !== null && <AppText style={{ color: colors.accent }}>Variação: {month.delta >= 0 ? '+' : '−'}{fmt(Math.abs(month.delta))}</AppText>}
            </>
          )}
        </Card>

        {weekly && (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="h2">Resumo da semana</AppText>
            <AppText>Treinos: {weekly.workouts} <AppText muted>(semana anterior: {weekly.prevWorkouts})</AppText></AppText>
            <AppText>Volume: {fmtKg(weekly.volume)} <AppText muted>(anterior: {fmtKg(weekly.prevVolume)})</AppText></AppText>
            <AppText>{weekly.kcalAvg !== null ? `Calorias médias: ${fmtNumber(weekly.kcalAvg)} kcal${weekly.goalKcal ? ` (objetivo ${fmtNumber(weekly.goalKcal)})` : ''} · Proteína: ${weekly.proteinAvg} g · ${weekly.daysLogged} dia(s) registado(s)` : 'Sem registo alimentar esta semana.'}</AppText>
            <AppText>{weekly.weightDelta !== null ? `Peso (14 dias): ${weekly.weightDelta >= 0 ? '+' : '−'}${fmtNumber(Math.abs(weekly.weightDelta))} kg` : 'Peso: sem registos suficientes.'}</AppText>
          </Card>
        )}

        <SectionTitle>Histórico</SectionTitle>
        {list.length === 0 && <EmptyState icon="body-outline" title="Sem registos" text="Regista o peso ou as medidas para veres a tua evolução." action={{ label: 'Fazer primeiro registo', onPress: () => router.push('/progress/new') }} />}
        <ListGroup>
        {list.slice(0, 30).map((m) => (
          <ListRow key={m.id} onPress={() => router.push({ pathname: '/progress/new', params: { id: m.id } })} title={fmtDate(new Date(`${m.date}T12:00:00`).getTime())}
            sub={[m.weight != null && fmtKg(m.weight), m.bmi != null && `IMC ${m.bmi}`, m.bodyFat != null && `${m.bodyFat} % gord. (${sourceTag(m.bodyFatSource)})`, m.waist != null && `cintura ${m.waist} cm`].filter(Boolean).join(' · ') || 'Medidas corporais'} />
        ))}
        </ListGroup>
      </ScrollView>
    </Screen>
  );
}
