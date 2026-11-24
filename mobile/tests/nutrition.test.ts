import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { freshDb, type TestDb } from './testDb';

let db: TestDb;
vi.mock('../database/db', () => ({ getDb: async () => db }));
vi.mock('../utils/uuid', () => ({ uuid: () => randomUUID() }));

import * as foods from '../features/nutrition/foodsRepo';
import * as nut from '../features/nutrition/nutritionRepo';
import * as recipes from '../features/nutrition/recipesRepo';
import { dashboardStats } from '../features/workouts/statsRepo';

const A = 'user-a', B = 'user-b', D = '2026-11-15';
beforeEach(async () => { db = await freshDb(); });

const oats = { name: 'Aveia', brand: null, barcode: '5601234567890', baseUnit: 'g' as const, per100: { kcal: 370, protein: 13, carbs: 60, fat: 7, fiber: 10 }, servingSize: 40, servingLabel: '40 g', unitWeight: null, source: 'openfoodfacts' as const };
const milk = { name: 'Leite', brand: 'Marca', barcode: null, baseUnit: 'ml' as const, per100: { kcal: 46, protein: 3.3, carbs: 4.8, fat: 1.6 }, servingSize: 250, servingLabel: '250 ml', unitWeight: null, source: 'custom' as const };

describe('alimentos', () => {
  it('guarda, valida, evita duplicar código de barras e isola por utilizador', async () => {
    const f = await foods.saveFood(A, oats);
    const again = await foods.saveFood(A, { ...oats, name: 'Aveia em flocos' });
    expect(again.id).toBe(f.id); expect(again.name).toBe('Aveia em flocos');
    await expect(foods.saveFood(A, { ...oats, barcode: null, per100: { ...oats.per100, kcal: 5000 } })).rejects.toThrow(/900/);
    await expect(foods.saveFood(A, { ...oats, barcode: null, name: ' ' })).rejects.toThrow(/nome/);
    expect((await foods.findByBarcode(A, '5601234567890'))!.id).toBe(f.id);
    expect(await foods.findByBarcode(B, '5601234567890')).toBeNull();
    expect(await foods.searchFoods(B, { query: 'aveia' })).toHaveLength(0);
    expect(await foods.getFood(B, f.id)).toBeNull();
    // o mesmo código pode existir noutro utilizador
    expect((await foods.saveFood(B, oats)).id).not.toBe(f.id);
  });
  it('favoritos e recentes', async () => {
    const f = await foods.saveFood(A, oats); await foods.saveFood(A, milk);
    await foods.setFavorite(A, f.id, true);
    expect((await foods.searchFoods(A, { favorites: true })).map((x) => x.name)).toEqual(['Aveia']);
    expect(await foods.searchFoods(A, { recent: true })).toHaveLength(0);
    await foods.touchFood(A, f.id);
    expect((await foods.searchFoods(A, { recent: true })).map((x) => x.id)).toEqual([f.id]);
  });
});

describe('diário', () => {
  it('regista, calcula totais, edita e apaga; unidades; valida', async () => {
    const o = await foods.saveFood(A, oats); const m = await foods.saveFood(A, milk);
    const e1 = await nut.logFood(A, { date: D, meal: 'breakfast', food: o, quantity: 80, unit: 'g' });
    expect(e1).toMatchObject({ kcal: 296, protein: 10.4, carbs: 48, fat: 5.6, fiber: 8 });
    const e2 = await nut.logFood(A, { date: D, meal: 'breakfast', food: m, quantity: 1, unit: 'serving' }); // 250 ml
    expect(e2.kcal).toBe(115);
    let day = await nut.getDay(A, D);
    expect(day.entries).toHaveLength(2);
    expect(day.totals.kcal).toBe(411);
    await expect(nut.logFood(A, { date: D, meal: 'lunch', food: o, quantity: 1, unit: 'unit' })).rejects.toThrow(/unidade/);
    await expect(nut.logFood(A, { date: D, meal: 'lunch', food: o, quantity: 100, unit: 'ml' })).rejects.toThrow();
    await expect(nut.logFood(A, { date: D, meal: 'lunch', food: o, quantity: 0, unit: 'g' })).rejects.toThrow();
    // editar quantidade e unidade
    const up = await nut.updateEntry(A, e1.id, { quantity: 2, unit: 'serving' });
    expect(up).toMatchObject({ kcal: 296, quantity: 2, unit: 'serving' });
    const up2 = await nut.updateEntry(A, e1.id, { quantity: 40, unit: 'g', meal: 'snack' });
    expect(up2).toMatchObject({ kcal: 148, meal: 'snack' });
    await nut.deleteEntry(A, e2.id);
    day = await nut.getDay(A, D);
    expect(day.entries.map((e) => e.id)).toEqual([e1.id]);
    // isolamento
    expect((await nut.getDay(B, D)).entries).toHaveLength(0);
    await expect(nut.updateEntry(B, e1.id, { quantity: 1 })).rejects.toThrow();
    // histórico mantém valores se o alimento for apagado
    await foods.deleteFood(A, o.id);
    expect((await nut.getDay(A, D)).entries[0]!.kcal).toBe(148);
  });
  it('refeições personalizadas', async () => {
    expect(await nut.addCustomMeal(A, ' Pré-treino ')).toBe('Pré-treino');
    await nut.addCustomMeal(A, 'pré-treino');
    expect(await nut.getCustomMeals(A)).toEqual(['Pré-treino']);
    await expect(nut.addCustomMeal(A, ' ')).rejects.toThrow();
  });
});

describe('objetivos', () => {
  it('estimativa só é guardada com ação explícita; histórico por data', async () => {
    const p = { sex: 'male' as const, age: 30, heightCm: 180, weightKg: 80, activity: 'moderate' as const, goal: 'muscle_gain' as const };
    await nut.saveProfile(A, p);
    expect(await nut.getProfile(A)).toEqual(p);
    expect(await nut.getGoal(A, D)).toBeNull(); // guardar perfil não cria objetivos
    const est = nut.estimateFromProfile(p);
    expect(est.calories).toBe(3035);
    await nut.setGoal(A, est, '2026-11-01');
    await nut.setGoal(A, { ...est, calories: 2800 }, '2026-11-10');
    expect((await nut.getGoal(A, '2026-11-05'))!.calories).toBe(3035);
    expect((await nut.getGoal(A, D))!.calories).toBe(2800);
    expect(await nut.getGoal(A, '2026-10-31')).toBeNull();
    await expect(nut.setGoal(A, { ...est, calories: 100 })).rejects.toThrow(/calorias/);
    expect(await nut.getGoal(B, D)).toBeNull();
  });
});

describe('receitas e meal prep', () => {
  it('totais, por dose, edição, duplicar, doses no diário', async () => {
    const o = await foods.saveFood(A, oats); const m = await foods.saveFood(A, milk);
    const id = await recipes.createRecipe(A, 'Papas', 2);
    await recipes.addIngredient(A, id, o.id, 100, 'g');
    await recipes.addIngredient(A, id, m.id, 500, 'ml');
    let r = (await recipes.getRecipe(A, id))!;
    expect(r.totals).toMatchObject({ kcal: 600, protein: 29.5, carbs: 84, fat: 15 });
    expect(r.perServing.kcal).toBe(300);
    await recipes.updateIngredientQuantity(A, id, r.ingredients[1]!.id, 250);
    r = (await recipes.getRecipe(A, id))!;
    expect(r.totals.kcal).toBe(485);
    await recipes.updateRecipe(A, id, { servings: 4 });
    expect((await recipes.getRecipe(A, id))!.perServing.kcal).toBe(121.3);
    await expect(recipes.updateRecipe(A, id, { servings: 0 })).rejects.toThrow();
    const entry = await nut.logRecipePortions(A, { date: D, meal: 'lunch', recipeId: id, portions: 2 });
    expect(entry.kcal).toBe(242.5);
    const edited = await nut.updateEntry(A, entry.id, { quantity: 1 });
    expect(edited.kcal).toBe(121.3);
    // meal prep
    await recipes.cookBatch(A, id, 4);
    await nut.logRecipePortions(A, { date: D, meal: 'dinner', recipeId: id, portions: 1.5 });
    expect((await recipes.getRecipe(A, id))!.remainingPortions).toBe(2.5);
    await nut.logRecipePortions(A, { date: D, meal: 'dinner', recipeId: id, portions: 5 });
    expect((await recipes.getRecipe(A, id))!.remainingPortions).toBe(0);
    const copy = await recipes.duplicateRecipe(A, id);
    expect((await recipes.getRecipe(A, copy))!.totals.kcal).toBe(485);
    await recipes.removeIngredient(A, copy, (await recipes.getRecipe(A, copy))!.ingredients[0]!.id);
    expect((await recipes.getRecipe(A, id))!.ingredients).toHaveLength(2); // original intacto
    // vazia não pode ser registada; isolamento
    const empty = await recipes.createRecipe(A, 'Vazia');
    await expect(nut.logRecipePortions(A, { date: D, meal: 'lunch', recipeId: empty, portions: 1 })).rejects.toThrow(/ingredientes/);
    expect(await recipes.getRecipe(B, id)).toBeNull();
    await expect(nut.logRecipePortions(B, { date: D, meal: 'lunch', recipeId: id, portions: 1 })).rejects.toThrow();
    await recipes.deleteRecipe(A, copy);
    expect((await recipes.listRecipes(A)).map((x) => x.id)).not.toContain(copy);
  });
});

describe('dashboard de nutrição', () => {
  it('totais de hoje e objetivo', async () => {
    const o = await foods.saveFood(A, oats);
    const today = new Date(); const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect((await dashboardStats(A)).nutrition).toMatchObject({ totals: { kcal: 0 }, goal: null });
    await nut.setGoal(A, { calories: 2500, protein: 160, carbs: 280, fat: 70 }, '2020-01-01');
    await nut.logFood(A, { date: key, meal: 'lunch', food: o, quantity: 100, unit: 'g' });
    const s = (await dashboardStats(A)).nutrition;
    expect(s.totals.kcal).toBe(370); expect(s.goal!.calories).toBe(2500);
  });
});
