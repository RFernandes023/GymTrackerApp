import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { toDateKey } from '@gym/shared';
import { AppText, Button, Card, Screen, BackLink } from '../../components/ui';
import { Chip, ChipRow, Field, Stepper } from '../../components/form';
import { useAuth } from '../../store/authStore';
import * as repo from '../../features/nutrition/recipesRepo';
import { getCustomMeals, logRecipePortions } from '../../features/nutrition/nutritionRepo';
import { MEAL_TYPES, mealLabel } from '../../features/nutrition/types';
import { colors, spacing } from '../../theme/tokens';

export default function RecipeEditor() {
  const user = useAuth((s) => s.user)!;
  const { id } = useLocalSearchParams<{ id: string }>();
  const rid = String(id);
  const [r, setR] = useState<repo.Recipe | null>(null);
  const [meals, setMeals] = useState<string[]>([...MEAL_TYPES]);
  const [meal, setMeal] = useState('lunch');
  const [portions, setPortions] = useState(1);
  const [batch, setBatch] = useState(4);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => { setR(await repo.getRecipe(user.id, rid)); setMeals([...MEAL_TYPES, ...(await getCustomMeals(user.id))]); }, [user.id, rid]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { setError(null); setMsg(null); await fn(); if (ok) setMsg(ok); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } };

  if (!r) return <Screen><View style={{ padding: spacing.lg }}><AppText muted>A carregar…</AppText></View></Screen>;
  const m = r.perServing;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <BackLink />
        <Field label="Nome" defaultValue={r.name} onEndEditing={(e) => void run(() => repo.updateRecipe(user.id, rid, { name: e.nativeEvent.text }))} />
        <Stepper label="Número de doses da receita" value={r.servings} step={1} min={0.5} max={100} onChange={(v) => void run(() => repo.updateRecipe(user.id, rid, { servings: v }))} />

        <Card style={{ gap: spacing.xs }}>
          <AppText variant="small" muted>Por dose</AppText>
          <AppText variant="h2">{Math.round(m.kcal)} kcal</AppText>
          <AppText muted>P {m.protein} g · H {m.carbs} g · G {m.fat} g</AppText>
          <AppText variant="small" muted>Total da receita: {Math.round(r.totals.kcal)} kcal · P {r.totals.protein} · H {r.totals.carbs} · G {r.totals.fat}</AppText>
        </Card>

        <AppText variant="h2">Ingredientes</AppText>
        {r.ingredients.length === 0 && <AppText muted>Sem ingredientes.</AppText>}
        {r.ingredients.map((x) => (
          <Card key={x.id} style={{ gap: spacing.sm }}>
            <AppText style={{ fontWeight: '600' }}>{x.name}</AppText>
            <AppText variant="small" muted>{Math.round(x.kcal)} kcal · P {x.protein} · H {x.carbs} · G {x.fat}</AppText>
            <Stepper label={`Quantidade (${x.unit === 'serving' ? 'doses' : x.unit === 'unit' ? 'unidades' : x.unit})`} value={x.quantity} step={x.unit === 'g' || x.unit === 'ml' ? 5 : 0.5} min={0.1} onChange={(v) => void run(() => repo.updateIngredientQuantity(user.id, rid, x.id, v))} />
            <Button label="Remover" variant="danger" onPress={() => void run(() => repo.removeIngredient(user.id, rid, x.id))} />
          </Card>
        ))}
        <Button label="Adicionar ingrediente" variant="secondary" onPress={() => router.push({ pathname: '/nutrition/add', params: { recipeId: rid } })} />

        <Card style={{ gap: spacing.md }}>
          <AppText variant="h2">Registar no diário</AppText>
          <ChipRow>{meals.map((x) => <Chip key={x} label={mealLabel(x)} selected={meal === x} onPress={() => setMeal(x)} />)}</ChipRow>
          <Stepper label="Doses" value={portions} step={0.5} min={0.5} max={20} onChange={setPortions} />
          <Button label="Adicionar ao diário (hoje)" disabled={r.ingredients.length === 0} onPress={() => void run(() => logRecipePortions(user.id, { date: toDateKey(Date.now()), meal, recipeId: rid, portions }), 'Adicionado ao diário de hoje.')} />
          {msg ? <AppText style={{ color: colors.primary }}>{msg}</AppText> : null}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <AppText variant="h2">Meal prep</AppText>
          {r.isMealPrep && r.remainingPortions != null ? <AppText>Doses disponíveis: {r.remainingPortions}</AppText> : <AppText muted>Marca um lote cozinhado para controlares quantas doses restam.</AppText>}
          <Stepper label="Doses cozinhadas" value={batch} step={1} min={1} max={50} onChange={setBatch} />
          <Button label="Registar lote cozinhado" variant="secondary" onPress={() => void run(() => repo.cookBatch(user.id, rid, batch), 'Lote registado.')} />
          {r.isMealPrep && <Button label="Terminar meal prep" variant="secondary" onPress={() => void run(() => repo.updateRecipe(user.id, rid, { isMealPrep: false, remainingPortions: null }))} />}
        </Card>

        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
        <Button label={r.isFavorite ? '★ Remover dos favoritos' : '☆ Guardar nos favoritos'} variant="secondary" onPress={() => void run(() => repo.updateRecipe(user.id, rid, { isFavorite: !r.isFavorite }))} />
        <Button label="Duplicar receita" variant="secondary" onPress={() => void run(async () => { const nid = await repo.duplicateRecipe(user.id, rid); router.replace({ pathname: '/recipes/[id]', params: { id: nid } }); })} />
        <Button label="Eliminar receita" variant="danger" onPress={() => Alert.alert('Eliminar receita', 'O diário mantém os registos já feitos.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await repo.deleteRecipe(user.id, rid); router.replace('/recipes'); } }])} />
      </ScrollView>
    </Screen>
  );
}
