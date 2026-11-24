import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addDays, toDateKey } from '@gym/shared';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { Field } from '../../components/form';
import { MacroRow, ProgressBar } from '../../components/Progress';
import { useAuth } from '../../store/authStore';
import { addCustomMeal, getCustomMeals, getDay, type DayView } from '../../features/nutrition/nutritionRepo';
import { MEAL_TYPES, mealLabel } from '../../features/nutrition/types';
import { colors, MIN_TOUCH, radius, spacing } from '../../theme/tokens';
import { fmtNumber } from '../../utils/format';

const dayFmt = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Diary() {
  const user = useAuth((s) => s.user)!;
  const [date, setDate] = useState(toDateKey(Date.now()));
  const [day, setDay] = useState<DayView | null>(null);
  const [custom, setCustom] = useState<string[]>([]);
  const [newMeal, setNewMeal] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => { setDay(await getDay(user.id, date)); setCustom(await getCustomMeals(user.id)); }, [user.id, date]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const today = toDateKey(Date.now());
  const meals = [...MEAL_TYPES as readonly string[], ...custom, ...(day?.entries.map((e) => e.meal) ?? [])].filter((m, i, a) => a.indexOf(m) === i);
  const t = day?.totals; const g = day?.goal ?? null;
  const remaining = g && t ? Math.round(g.calories - t.kcal) : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <AppText variant="title">Nutrição</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dia anterior" onPress={() => setDate(addDays(date, -1))} style={nav}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDate(today)}>
            <AppText style={{ textTransform: 'capitalize', fontWeight: '600' }}>{date === today ? 'Hoje' : dayFmt.format(new Date(`${date}T12:00:00`))}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dia seguinte" onPress={() => setDate(addDays(date, 1))} style={nav}><Ionicons name="chevron-forward" size={22} color={colors.text} /></Pressable>
        </View>

        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <AppText variant="small" muted>Consumidas</AppText>
              <AppText variant="stat">{fmtNumber(Math.round(t?.kcal ?? 0))}<AppText muted> kcal</AppText></AppText>
            </View>
            {g ? (
              <View style={{ alignItems: 'flex-end' }}>
                <AppText variant="small" muted>{remaining! >= 0 ? 'Restantes' : 'Acima do objetivo'}</AppText>
                <AppText variant="h2" style={{ color: remaining! >= 0 ? colors.primary : colors.warning }}>{fmtNumber(Math.abs(remaining!))} kcal</AppText>
              </View>
            ) : null}
          </View>
          {g ? <ProgressBar value={t?.kcal ?? 0} max={g.calories} label="Progresso calórico" /> : null}
          <MacroRow name="Proteínas" value={t?.protein ?? 0} goal={g?.protein ?? null} color={colors.accent} />
          <MacroRow name="Hidratos de carbono" value={t?.carbs ?? 0} goal={g?.carbs ?? null} color={colors.primary} />
          <MacroRow name="Gorduras" value={t?.fat ?? 0} goal={g?.fat ?? null} color={colors.warning} />
          {!g && <AppText variant="small" muted>Sem objetivo definido para este dia.</AppText>}
          <Button label={g ? 'Objetivos' : 'Definir objetivos'} variant="secondary" onPress={() => router.push('/nutrition/goals')} />
        </Card>

        {meals.map((m) => {
          const es = day?.entries.filter((e) => e.meal === m) ?? [];
          const kcal = es.reduce((a, e) => a + e.kcal, 0);
          return (
            <Card key={m} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="h2">{mealLabel(m)}</AppText>
                <AppText muted>{Math.round(kcal)} kcal</AppText>
              </View>
              {es.map((e) => (
                <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/nutrition/log', params: { entryId: e.id, date, meal: m } })}
                  style={{ minHeight: MIN_TOUCH, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border }}>
                  <AppText numberOfLines={1}>{e.name}</AppText>
                  <AppText variant="small" muted>{fmtNumber(e.quantity)} {e.unit === 'serving' ? 'dose(s)' : e.unit === 'unit' ? 'unid.' : e.unit} · {Math.round(e.kcal)} kcal · P {Math.round(e.protein)} · H {Math.round(e.carbs)} · G {Math.round(e.fat)}</AppText>
                </Pressable>
              ))}
              <Button label="+ Adicionar alimento" variant="secondary" onPress={() => router.push({ pathname: '/nutrition/add', params: { date, meal: m } })} />
            </Card>
          );
        })}

        <Card style={{ gap: spacing.sm }}>
          <Field label="Nova refeição personalizada" value={newMeal} onChangeText={setNewMeal} placeholder="Ex.: Pré-treino" />
          {error ? <AppText variant="small" style={{ color: colors.danger }}>{error}</AppText> : null}
          <Button label="Criar refeição" variant="secondary" disabled={!newMeal.trim()} onPress={async () => { try { setError(null); await addCustomMeal(user.id, newMeal); setNewMeal(''); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } }} />
        </Card>
        <Button label="Receitas e meal prep" variant="secondary" onPress={() => router.push('/recipes')} />
      </ScrollView>
    </Screen>
  );
}
const nav = { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const };
