import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { QUANTITY_UNIT_LABELS, availableUnits, toDateKey, type Macros, type QuantityUnit } from '@gym/shared';
import { AppText, Button, Card, Screen, BackLink } from '../../components/ui';
import { Chip, ChipRow, Stepper } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { deleteFood, getFood, setFavorite } from '../../features/nutrition/foodsRepo';
import { deleteEntry, getCustomMeals, logFood, logRecipePortions, snapshotFor, updateEntry } from '../../features/nutrition/nutritionRepo';
import { addIngredient, getRecipe } from '../../features/nutrition/recipesRepo';
import { MEAL_TYPES, mealLabel, type FoodRecord } from '../../features/nutrition/types';
import { getDb } from '../../database/db';
import { colors, spacing } from '../../theme/tokens';

const stepFor = (u: QuantityUnit) => (u === 'g' || u === 'ml' ? 5 : 0.5);

export default function LogScreen() {
  const user = useAuth((s) => s.user)!;
  const p = useLocalSearchParams<{ foodId?: string; recipeId?: string; entryId?: string; date?: string; meal?: string; recipeTarget?: string }>();
  const [food, setFood] = useState<FoodRecord | null>(null);
  const [recipeName, setRecipeName] = useState<string | null>(null);
  const [recipePer, setRecipePer] = useState<Macros | null>(null);
  const [unit, setUnit] = useState<QuantityUnit>('g');
  const [quantity, setQuantity] = useState(100);
  const [meal, setMeal] = useState(p.meal ?? 'snack');
  const [meals, setMeals] = useState<string[]>([...MEAL_TYPES]);
  const [entryName, setEntryName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const date = p.date ?? toDateKey(Date.now());
  const editing = !!p.entryId;
  const isRecipe = !!p.recipeId || (editing && unit === 'serving' && !food);

  useEffect(() => {
    void (async () => {
      setMeals([...MEAL_TYPES, ...(await getCustomMeals(user.id))].filter((m, i, a) => a.indexOf(m) === i));
      if (p.entryId) {
        const db = await getDb();
        const e = await db.getFirstAsync<any>('SELECT * FROM nutrition_entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL', p.entryId, user.id);
        if (!e) { router.back(); return; }
        setEntryName(e.name); setQuantity(e.quantity); setUnit(e.unit); setMeal(e.meal);
        if (e.food_id) setFood(await getFood(user.id, e.food_id));
        if (e.recipe_id) { setRecipePer(JSON.parse(e.per_unit)); }
      } else if (p.foodId) {
        const f = await getFood(user.id, p.foodId);
        if (!f) { router.back(); return; }
        setFood(f);
        if (f.servingSize) { setUnit('serving'); setQuantity(1); } else { setUnit(f.baseUnit); setQuantity(100); }
      } else if (p.recipeId) {
        const r = await getRecipe(user.id, p.recipeId);
        if (!r) { router.back(); return; }
        setRecipeName(r.name); setRecipePer(r.perServing); setUnit('serving'); setQuantity(1);
      }
      setReady(true);
    })();
  }, [p.entryId, p.foodId, p.recipeId, user.id]);

  const units = food ? availableUnits(food) : (['serving'] as QuantityUnit[]);
  const preview = useMemo<Macros | null>(() => {
    try {
      if (food) return snapshotFor(food, quantity, unit).macros;
      if (recipePer) return { kcal: Math.round(recipePer.kcal * quantity * 10) / 10, protein: Math.round(recipePer.protein * quantity * 10) / 10, carbs: Math.round(recipePer.carbs * quantity * 10) / 10, fat: Math.round(recipePer.fat * quantity * 10) / 10, fiber: 0 };
    } catch { /* unidade inválida */ }
    return null;
  }, [food, recipePer, quantity, unit]);

  const save = async () => {
    try {
      setError(null);
      if (p.recipeTarget && food) await addIngredient(user.id, p.recipeTarget, food.id, quantity, unit);
      else if (editing) await updateEntry(user.id, p.entryId!, { quantity, unit, meal });
      else if (food) await logFood(user.id, { date, meal, food, quantity, unit });
      else if (p.recipeId) await logRecipePortions(user.id, { date, meal, recipeId: p.recipeId, portions: quantity });
      router.dismissTo(p.recipeTarget ? { pathname: '/recipes/[id]', params: { id: p.recipeTarget } } : '/(tabs)/nutrition');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
  };
  const remove = () => Alert.alert('Remover', 'Remover este registo do diário?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Remover', style: 'destructive', onPress: async () => { await deleteEntry(user.id, p.entryId!); router.dismissTo('/(tabs)/nutrition'); } }]);

  if (!ready) return <Screen><View style={{ padding: spacing.lg }}><AppText muted>A carregar…</AppText></View></Screen>;
  const title = food?.name ?? recipeName ?? entryName ?? '';
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <BackLink />
        <View>
          <AppText variant="title">{title}</AppText>
          {food?.brand ? <AppText muted>{food.brand}</AppText> : null}
          {food ? <AppText variant="small" muted>{Math.round(food.per100.kcal)} kcal · P {food.per100.protein} · H {food.per100.carbs} · G {food.per100.fat} (por 100 {food.baseUnit})</AppText> : null}
        </View>
        <Stepper big label={isRecipe || (!food && unit === 'serving') ? 'Doses' : 'Quantidade'} value={quantity} step={stepFor(unit)} min={0.1} max={10000} onChange={setQuantity} />
        {food && units.length > 1 && (
          <ChipRow>{units.map((u) => <Chip key={u} label={u === 'serving' && food.servingLabel ? `dose (${food.servingLabel})` : QUANTITY_UNIT_LABELS[u]} selected={unit === u}
            onPress={() => { setUnit(u); setQuantity(u === 'g' || u === 'ml' ? 100 : 1); }} />)}</ChipRow>
        )}
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="small" muted>Valores para esta quantidade</AppText>
          <AppText variant="h2">{preview ? `${Math.round(preview.kcal)} kcal` : '—'}</AppText>
          {preview ? <AppText muted>Proteínas {preview.protein} g · Hidratos {preview.carbs} g · Gorduras {preview.fat} g</AppText> : <AppText style={{ color: colors.warning }}>Escolhe uma unidade válida.</AppText>}
        </Card>
        {!p.recipeTarget && (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="small" muted>Refeição</AppText>
            <ChipRow>{meals.map((m) => <Chip key={m} label={mealLabel(m)} selected={meal === m} onPress={() => setMeal(m)} />)}</ChipRow>
          </View>
        )}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
        <Button label={editing ? 'Guardar alterações' : p.recipeTarget ? 'Adicionar à receita' : 'Adicionar ao diário'} disabled={!preview} onPress={() => void save()} />
        {food && (
          <View style={{ gap: spacing.sm }}>
            <Button label={food.isFavorite ? '★ Remover dos favoritos' : '☆ Guardar nos favoritos'} variant="secondary" onPress={async () => { await setFavorite(user.id, food.id, !food.isFavorite); setFood({ ...food, isFavorite: !food.isFavorite }); }} />
            <Button label="Editar valores do alimento" variant="secondary" onPress={() => router.push({ pathname: '/nutrition/food-form', params: { foodId: food.id } })} />
            {!editing && <Button label="Eliminar alimento" variant="danger" onPress={() => Alert.alert('Eliminar alimento', 'O histórico do diário mantém os valores já registados.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteFood(user.id, food.id); router.back(); } }])} />}
          </View>
        )}
        {editing && <Button label="Remover do diário" variant="danger" onPress={remove} />}
      </ScrollView>
    </Screen>
  );
}
