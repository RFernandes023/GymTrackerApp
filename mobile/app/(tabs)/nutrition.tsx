import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addDays, toDateKey } from '@gym/shared';
import { AppText, Button, Card, IconButton, ListGroup, ListRow, Screen, SectionTitle, Sheet, TabHeader } from '../../components/ui';
import { Field } from '../../components/form';
import { NutritionSummary } from '../../components/NutritionSummary';
import { useAuth } from '../../store/authStore';
import { addCustomMeal, getCustomMeals, getDay, type DayView } from '../../features/nutrition/nutritionRepo';
import { MEAL_TYPES, mealLabel } from '../../features/nutrition/types';
import { colors, MIN_TOUCH, spacing } from '../../theme/tokens';
import { fmtNumber } from '../../utils/format';

const dayFmt = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Diary() {
  const user = useAuth((s) => s.user)!;
  const [date, setDate] = useState(toDateKey(Date.now()));
  const [day, setDay] = useState<DayView | null>(null);
  const [custom, setCustom] = useState<string[]>([]);
  const [newMeal, setNewMeal] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => { setDay(await getDay(user.id, date)); setCustom(await getCustomMeals(user.id)); }, [user.id, date]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const today = toDateKey(Date.now());
  const meals = [...MEAL_TYPES as readonly string[], ...custom, ...(day?.entries.map((e) => e.meal) ?? [])].filter((m, i, a) => a.indexOf(m) === i);
  const t = day?.totals; const g = day?.goal ?? null;
  const remaining = g && t ? Math.round(g.calories - t.kcal) : null;
  const add = (meal: string) => router.push({ pathname: '/nutrition/add', params: { date, meal } });
  const closeSheet = () => { setCreating(false); setError(null); setNewMeal(''); };

  return (
    <Screen tab>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <TabHeader title="Nutrição" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton name="chevron-back" label="Dia anterior" onPress={() => setDate(addDays(date, -1))} />
          <Pressable accessibilityRole="button" accessibilityHint="Voltar a hoje" onPress={() => setDate(today)} style={{ flex: 1, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <AppText style={{ fontWeight: '700' }}>{date === today ? 'Hoje' : dayFmt.format(new Date(`${date}T12:00:00`))}</AppText>
            {date !== today && <AppText variant="small" style={{ color: colors.primary }}>Voltar a hoje</AppText>}
          </Pressable>
          <IconButton name="chevron-forward" label="Dia seguinte" onPress={() => setDate(addDays(date, 1))} />
        </View>

        <Card style={{ gap: spacing.lg }}>
          <NutritionSummary totals={t ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }} goal={g} />
          {remaining !== null ? (
            <AppText style={{ textAlign: 'center', fontWeight: '600', color: remaining >= 0 ? colors.primary : colors.warning }}>
              {remaining >= 0 ? `Ainda tens ${fmtNumber(remaining)} kcal` : `${fmtNumber(-remaining)} kcal acima do objetivo`}
            </AppText>
          ) : <Button label="Definir objetivos" variant="secondary" compact onPress={() => router.push('/nutrition/goals')} />}
        </Card>

        <SectionTitle action={{ label: 'Nova refeição', onPress: () => setCreating(true) }}>Refeições</SectionTitle>
        {meals.map((m) => {
          const es = day?.entries.filter((e) => e.meal === m) ?? [];
          const kcal = es.reduce((a, e) => a + e.kcal, 0);
          return (
            <Card key={m} style={{ gap: 0, paddingVertical: spacing.xs, paddingRight: spacing.xs }}>
              <Pressable accessibilityRole="button" accessibilityLabel="+ Adicionar alimento" accessibilityHint={mealLabel(m)} onPress={() => add(m)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 56, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flex: 1 }}>
                  <AppText style={{ fontWeight: '700', fontSize: 17 }}>{mealLabel(m)}</AppText>
                  <AppText variant="small" muted>{es.length ? `${Math.round(kcal)} kcal` : 'Toca para adicionar'}</AppText>
                </View>
                <View style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add-circle" size={30} color={colors.primary} /></View>
              </Pressable>
              {es.map((e) => (
                <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/nutrition/log', params: { entryId: e.id, date, meal: m } })}
                  style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 })}>
                  <View style={{ flex: 1 }}>
                    <AppText numberOfLines={1}>{e.name}</AppText>
                    <AppText variant="small" muted numberOfLines={1}>{fmtNumber(e.quantity)} {e.unit === 'serving' ? 'dose(s)' : e.unit === 'unit' ? 'unid.' : e.unit} · P {Math.round(e.protein)} · H {Math.round(e.carbs)} · G {Math.round(e.fat)}</AppText>
                  </View>
                  <AppText style={{ fontWeight: '600' }}>{Math.round(e.kcal)}</AppText>
                </Pressable>
              ))}
            </Card>
          );
        })}

        <ListGroup>
          <ListRow icon="restaurant-outline" title="Receitas e meal prep" onPress={() => router.push('/recipes')} />
          <ListRow icon="camera-outline" color={colors.purple} title="Foto de refeição" sub="Estimativa por IA" onPress={() => router.push('/nutrition/meal-photo')} />
          <ListRow icon="flag-outline" color={colors.accent} title="Objetivos" sub="Calorias e macros por dia" onPress={() => router.push('/nutrition/goals')} />
        </ListGroup>
      </ScrollView>

      <Sheet visible={creating} title="Nova refeição" onClose={closeSheet}
        footer={<Button label="Criar refeição" disabled={!newMeal.trim()} onPress={async () => { try { setError(null); await addCustomMeal(user.id, newMeal); closeSheet(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } }} />}>
        <Field label="Nome" value={newMeal} onChangeText={setNewMeal} placeholder="Ex.: Pré-treino" />
        {error ? <AppText variant="small" style={{ color: colors.danger }}>{error}</AppText> : null}
      </Sheet>
    </Screen>
  );
}
