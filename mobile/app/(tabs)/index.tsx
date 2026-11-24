import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DASHBOARD_CARD_DEFS, DASHBOARD_GROUP_LABELS, toDateKey, type DashboardCardDef } from '@gym/shared';
import { AppText, Button, Card, IconButton, ListGroup, ListRow, Screen, SectionTitle, Sheet, TabHeader } from '../../components/ui';
import { ActiveWorkoutCard } from '../../components/ActiveWorkoutCard';
import { NutritionSummary } from '../../components/NutritionSummary';
import { useAuth } from '../../store/authStore';
import { useDashboard } from '../../store/dashboardStore';
import { useSync } from '../../store/syncStore';
import { dashboardStats, type DashboardStats } from '../../features/workouts/statsRepo';
import { getActiveSessionId, getSession } from '../../features/workouts/sessionsRepo';
import type { Session } from '../../features/workouts/types';
import { localInsights } from '../../features/ai/insights';
import { cardValue, PHASE_DONE } from '../../features/dashboard/cardValues';
import { colors, MIN_TOUCH, radius, spacing } from '../../theme/tokens';

const SYNC_ICON = { idle: 'cloud-done-outline', syncing: 'sync-outline', offline: 'cloud-offline-outline', error: 'alert-circle-outline', conflict: 'warning-outline' } as const;
const SYNC_LABEL = { idle: 'Tudo sincronizado', syncing: 'A sincronizar', offline: 'Sem ligação, alterações guardadas', error: 'Erro de sincronização', conflict: 'Conflito por resolver' } as const;
const GROUP_COLOR = { nutrition: colors.primary, training: colors.accent, progress: colors.warning, other: colors.purple } as const;
const GROUP_ICON = { nutrition: 'nutrition-outline', training: 'barbell-outline', progress: 'trending-up-outline', other: 'sparkles-outline' } as const;
const defByType = new Map(DASHBOARD_CARD_DEFS.map((d) => [d.type, d]));
/** Já aparecem nos blocos fixos do topo (treino e nutrição de hoje): não se repetem nos cartões. */
const IN_HERO = new Set(['next_workout', 'today_workout', 'kcal_consumed', 'kcal_goal', 'kcal_remaining', 'macro_protein', 'macro_carbs', 'macro_fat', 'daily_progress']);
const todayFmt = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

/** Refeição mais provável à hora atual. */
export const mealForHour = (h: number) => (h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 19 ? 'snack' : 'dinner');

function StatTile({ def, value }: { def: DashboardCardDef; value: ReturnType<typeof cardValue> }) {
  const ready = def.availableInPhase <= PHASE_DONE;
  const wide = def.type === 'ai_suggestions';
  return (
    <Pressable accessibilityRole={value?.route ? 'button' : undefined} disabled={!value?.route} onPress={() => value?.route && router.push(value.route as never)}
      style={{ flexBasis: wide ? '100%' : '46%', flexGrow: 1 }}>
      <Card style={{ flex: 1, gap: spacing.xs, padding: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={GROUP_ICON[def.group]} size={15} color={GROUP_COLOR[def.group]} />
          <AppText variant="small" muted numberOfLines={2} style={{ flex: 1 }}>{def.title}</AppText>
        </View>
        {/* Estado vazio honesto: sem dados reais mostra "—" (nunca valores inventados). */}
        <AppText variant="h2" numberOfLines={2} style={value ? { fontSize: 22 } : { color: colors.textMuted }}>{value?.value ?? '—'}</AppText>
        <AppText variant="small" muted numberOfLines={wide ? 4 : 2}>{value?.sub ?? (ready ? 'Sem dados ainda' : 'Em breve')}</AppText>
      </Card>
    </Pressable>
  );
}

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const { layout, editing, load, toggle, moveCard, setEditing } = useDashboard();
  const sync = useSync();
  const [adding, setAdding] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [active, setActive] = useState<Session | null>(null);

  const loadActive = useCallback(async () => {
    if (!user) return;
    const id = await getActiveSessionId(user.id);
    setActive(id ? await getSession(id) : null);
  }, [user]);

  useEffect(() => { if (user) void load(user.id); }, [user, load]);
  useFocusEffect(useCallback(() => {
    if (!user) return;
    void sync.refresh(); void loadActive();
    void (async () => { const st = await dashboardStats(user.id); setStats(st); setStats({ ...st, insights: (await localInsights(user.id)).slice(0, 3) }); })();
  }, [user, loadActive])); // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = layout.filter((c) => c.enabled);
  const cards = enabled.filter((c) => !IN_HERO.has(c.type) && defByType.has(c.type));
  const available = layout.filter((c) => !c.enabled && !IN_HERO.has(c.type));
  const workout = stats?.todayWorkout ?? stats?.nextWorkout ?? null;
  const openWorkout = () => workout && router.push({ pathname: '/workout/preview', params: { planId: workout.planId, dayId: workout.dayId } });

  /** Salta por cima dos cartões que não aparecem aqui, para cada toque mexer mesmo uma posição visível. */
  const moveVisible = async (type: string, d: -1 | 1) => {
    const neighbour = cards[cards.findIndex((c) => c.type === type) + d];
    if (!neighbour) return;
    const steps = Math.abs(enabled.findIndex((c) => c.type === type) - enabled.findIndex((c) => c.type === neighbour.type));
    for (let i = 0; i < steps; i++) await moveCard(type, d);
  };

  return (
    <Screen tab>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <TabHeader title={user?.name.split(' ')[0] ?? ''} sub={`Olá · ${todayFmt.format(new Date())}`}>
          {sync.status !== 'idle' && <IconButton name={SYNC_ICON[sync.status]} label={SYNC_LABEL[sync.status]} color={sync.status === 'syncing' ? colors.accent : colors.warning} filled={false} onPress={() => router.push('/sync')} />}
          <IconButton name="person-outline" label="Definições" onPress={() => router.push('/settings')} />
        </TabHeader>

        {active ? <ActiveWorkoutCard session={active} onChanged={() => void loadActive()} /> : workout ? (
          <Card style={{ gap: spacing.md }}>
            <View style={{ gap: 2 }}>
              <AppText variant="small" style={{ color: colors.accent, fontWeight: '700' }}>{stats?.todayWorkout ? 'Treino de hoje' : 'Próximo treino'}</AppText>
              <AppText variant="title">{workout.dayName}</AppText>
              <AppText variant="small" muted>{workout.planName}</AppText>
            </View>
            <Button label="Ver treino" icon="barbell-outline" onPress={openWorkout} />
          </Card>
        ) : stats ? (
          <Card style={{ gap: spacing.md }}>
            <View style={{ gap: 2 }}>
              <AppText variant="h2">Cria o teu primeiro plano</AppText>
              <AppText muted>Escolhe os dias e os exercícios. Depois o teu próximo treino aparece aqui.</AppText>
            </View>
            <Button label="Criar plano" icon="add" onPress={() => router.push('/plans')} />
          </Card>
        ) : null}

        <Card style={{ gap: spacing.lg }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir nutrição" onPress={() => router.navigate('/(tabs)/nutrition')} style={{ gap: spacing.md }}>
            <AppText variant="h2">Nutrição de hoje</AppText>
            <NutritionSummary totals={stats?.nutrition.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }} goal={stats?.nutrition.goal ?? null} />
          </Pressable>
          <Button label="Registar refeição" icon="add" variant="secondary" compact
            onPress={() => router.push({ pathname: '/nutrition/add', params: { date: toDateKey(Date.now()), meal: mealForHour(new Date().getHours()) } })} />
        </Card>

        <SectionTitle action={{ label: 'Personalizar', onPress: () => setEditing(true) }}>Resumo</SectionTitle>
        {cards.length === 0 && <AppText muted>Sem cartões. Toca em Personalizar para escolher o que queres ver.</AppText>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {cards.map((c) => <StatTile key={c.type} def={defByType.get(c.type)!} value={stats ? cardValue(c.type, stats) : null} />)}
        </View>

        <ListGroup>
          <ListRow icon="sparkles-outline" color={colors.purple} title="Treinador IA" sub="Análises, sugestões e planos" onPress={() => router.push('/coach')} />
        </ListGroup>
      </ScrollView>

      <Sheet visible={editing} title={adding ? 'Adicionar cartões' : 'Personalizar resumo'} onClose={() => { setAdding(false); setEditing(false); }}
        footer={adding ? <Button label="Voltar aos meus cartões" variant="secondary" onPress={() => setAdding(false)} />
          : <><Button label="Adicionar cartões" variant="secondary" icon="add" onPress={() => setAdding(true)} /><Button label="Concluir edição" onPress={() => setEditing(false)} /></>}>
        {!adding ? cards.map((c, i) => {
          const def = defByType.get(c.type)!;
          return (
            <View key={c.type} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.bg, borderRadius: radius.md, paddingLeft: spacing.md }}>
              <AppText style={{ flex: 1 }}>{def.title}</AppText>
              {i > 0 && <IconButton filled={false} name="chevron-up" label={`Subir ${def.title}`} onPress={() => void moveVisible(c.type, -1)} />}
              {i < cards.length - 1 && <IconButton filled={false} name="chevron-down" label={`Descer ${def.title}`} onPress={() => void moveVisible(c.type, 1)} />}
              <IconButton filled={false} name="close" color={colors.danger} label={`Remover ${def.title}`} onPress={() => void toggle(c.type, false)} />
            </View>
          );
        }) : (['nutrition', 'training', 'progress', 'other'] as const).map((g) => {
          const items = available.map((c) => defByType.get(c.type)).filter((d): d is DashboardCardDef => !!d && d.group === g);
          return items.length === 0 ? null : (
            <View key={g} style={{ gap: spacing.sm }}>
              <AppText variant="small" muted>{DASHBOARD_GROUP_LABELS[g]}</AppText>
              {items.map((d) => (
                <Pressable key={d.type} accessibilityRole="button" accessibilityLabel={`Adicionar ${d.title}`} onPress={() => void toggle(d.type, true)}
                  style={{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: spacing.lg }}>
                  <AppText style={{ flex: 1 }}>{d.title}</AppText>
                  <Ionicons name="add" size={22} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          );
        })}
        {adding && available.length === 0 && <AppText muted>Todos os cartões já estão no resumo.</AppText>}
      </Sheet>
    </Screen>
  );
}
