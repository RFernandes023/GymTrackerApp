import { amountInBase, estimateTargets, roundMacros, scaleMacrosExact, scaleNutrition, scalePer100Exact, sumMacros, toDateKey, type Macros, type MacroTargets, type QuantityUnit } from '@gym/shared';
import { getDb } from '../../database/db';
import { kvGet, kvSet } from '../../database/kv';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import { getFood, touchFood } from './foodsRepo';
import { enqueueProfile } from '../profile/profileSync';
import type { Entry, FoodRecord, Goal, Profile } from './types';

export interface Snapshot { amount: number | null; macros: Macros; perUnit: Macros }

/** Valores de uma quantidade de alimento + valores para 1 unidade (permite reescalar ao editar sem depender do alimento). */
export function snapshotFor(food: FoodRecord, quantity: number, unit: QuantityUnit): Snapshot {
  const amount = amountInBase(food, quantity, unit);
  if (amount === null) throw new Error(unit === 'serving' ? 'Este alimento não tem tamanho de dose definido.' : unit === 'unit' ? 'Este alimento não tem peso por unidade definido.' : 'Quantidade ou unidade inválida.');
  const one = amountInBase(food, 1, unit)!;
  return { amount, macros: scaleNutrition(food.per100, amount), perUnit: scalePer100Exact(food.per100, one) };
}

const toEntry = (r: any): Entry => ({ id: r.id, date: r.date, meal: r.meal, foodId: r.food_id, recipeId: r.recipe_id, name: r.name, quantity: r.quantity, unit: r.unit, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, createdAt: r.created_at, amount: r.amount ?? null, perUnit: r.per_unit ? JSON.parse(r.per_unit) : undefined });

async function insertEntry(userId: string, e: { date: string; meal: string; foodId: string | null; recipeId: string | null; name: string; quantity: number; unit: string; amount: number | null; macros: Macros; perUnit: Macros }) {
  if (!e.meal.trim()) throw new Error('Escolhe a refeição.');
  const db = await getDb(); const id = uuid(), now = Date.now();
  await db.runAsync(`INSERT INTO nutrition_entries (id, user_id, date, meal, food_id, recipe_id, name, quantity, unit, amount, kcal, protein, carbs, fat, fiber, per_unit, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, userId, e.date, e.meal.trim(), e.foodId, e.recipeId, e.name, e.quantity, e.unit, e.amount, e.macros.kcal, e.macros.protein, e.macros.carbs, e.macros.fat, e.macros.fiber, JSON.stringify(e.perUnit), now, now);
  const entry = toEntry(await db.getFirstAsync('SELECT * FROM nutrition_entries WHERE id = ?', id));
  await enqueue({ userId, entity: 'nutrition_entry', entityId: id, op: 'upsert', payload: entry, coalesce: true });
  return entry;
}

export async function logFood(userId: string, i: { date: string; meal: string; food: FoodRecord; quantity: number; unit: QuantityUnit }) {
  const snap = snapshotFor(i.food, i.quantity, i.unit);
  const entry = await insertEntry(userId, { date: i.date, meal: i.meal, foodId: i.food.id, recipeId: null, name: i.food.brand ? `${i.food.name} (${i.food.brand})` : i.food.name, quantity: i.quantity, unit: i.unit, amount: snap.amount, macros: snap.macros, perUnit: snap.perUnit });
  await touchFood(userId, i.food.id);
  return entry;
}

export async function logRecipePortions(userId: string, i: { date: string; meal: string; recipeId: string; portions: number }) {
  if (!(i.portions > 0)) throw new Error('Indica o número de doses.');
  const db = await getDb();
  const r = await db.getFirstAsync<any>('SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL', i.recipeId, userId);
  if (!r) throw new Error('Receita não encontrada.');
  const ing = await db.getAllAsync<any>('SELECT kcal, protein, carbs, fat, fiber FROM recipe_ingredients WHERE recipe_id = ?', i.recipeId);
  if (ing.length === 0) throw new Error('A receita não tem ingredientes.');
  const totals = sumMacros(ing);
  const one = scaleMacrosExact(totals, 1 / r.servings);
  const entry = await insertEntry(userId, { date: i.date, meal: i.meal, foodId: null, recipeId: i.recipeId, name: r.name, quantity: i.portions, unit: 'serving', amount: null, macros: roundMacros(scaleMacrosExact(one, i.portions)), perUnit: one });
  if (r.is_meal_prep === 1 && r.remaining_portions != null) await db.runAsync('UPDATE recipes SET remaining_portions = MAX(0, remaining_portions - ?), updated_at = ? WHERE id = ?', i.portions, Date.now(), i.recipeId);
  return entry;
}

export async function updateEntry(userId: string, entryId: string, patch: { quantity?: number; unit?: QuantityUnit; meal?: string; date?: string }) {
  const db = await getDb();
  const cur = await db.getFirstAsync<any>('SELECT * FROM nutrition_entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL', entryId, userId);
  if (!cur) throw new Error('Registo não encontrado.');
  let quantity = patch.quantity ?? cur.quantity, unit: string = patch.unit ?? cur.unit;
  let perUnit: Macros = JSON.parse(cur.per_unit); let amount: number | null = cur.amount;
  if (!(quantity > 0)) throw new Error('Quantidade inválida.');
  if (patch.unit && patch.unit !== cur.unit) {
    const food = cur.food_id ? await getFood(userId, cur.food_id) : null;
    if (!food) throw new Error('Não é possível mudar a unidade: o alimento já não existe.');
    const s = snapshotFor(food, 1, patch.unit); perUnit = s.perUnit;
  }
  const macros = roundMacros(scaleMacrosExact(perUnit, quantity));
  if (cur.food_id && amount !== null) { const food = await getFood(userId, cur.food_id); if (food) amount = amountInBase(food, quantity, unit as QuantityUnit); }
  await db.runAsync('UPDATE nutrition_entries SET quantity=?, unit=?, amount=?, kcal=?, protein=?, carbs=?, fat=?, fiber=?, per_unit=?, meal=?, date=?, updated_at=? WHERE id=?',
    quantity, unit, amount, macros.kcal, macros.protein, macros.carbs, macros.fat, macros.fiber, JSON.stringify(perUnit), (patch.meal ?? cur.meal).trim(), patch.date ?? cur.date, Date.now(), entryId);
  const e = toEntry(await db.getFirstAsync('SELECT * FROM nutrition_entries WHERE id = ?', entryId));
  await enqueue({ userId, entity: 'nutrition_entry', entityId: entryId, op: 'upsert', payload: e, coalesce: true });
  return e;
}

export async function deleteEntry(userId: string, entryId: string) {
  const db = await getDb();
  await db.runAsync('UPDATE nutrition_entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', Date.now(), Date.now(), entryId, userId);
  await enqueue({ userId, entity: 'nutrition_entry', entityId: entryId, op: 'delete', payload: { id: entryId }, coalesce: true });
}

export async function getGoal(userId: string, date: string): Promise<Goal | null> {
  const db = await getDb();
  const g = await db.getFirstAsync<any>('SELECT * FROM nutrition_goals WHERE user_id = ? AND start_date <= ? ORDER BY start_date DESC LIMIT 1', userId, date);
  return g ? { calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat, startDate: g.start_date } : null;
}

/** Guarda objetivos (só por ação explícita do utilizador). Mantém histórico por data de início. */
export async function setGoal(userId: string, g: { calories: number; protein: number; carbs: number; fat: number }, startDate = toDateKey(Date.now())) {
  if (!(g.calories >= 800 && g.calories <= 10000)) throw new Error('As calorias devem estar entre 800 e 10 000 kcal.');
  for (const [k, v] of [['proteínas', g.protein], ['hidratos', g.carbs], ['gorduras', g.fat]] as const) if (!(v >= 0 && v <= 1000)) throw new Error(`Valor inválido em ${k}.`);
  const db = await getDb();
  await db.runAsync(`INSERT INTO nutrition_goals (id, user_id, calories, protein, carbs, fat, start_date, created_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, start_date) DO UPDATE SET calories=excluded.calories, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat`, uuid(), userId, g.calories, g.protein, g.carbs, g.fat, startDate, Date.now());
  await enqueue({ userId, entity: 'nutrition_goal', entityId: `${userId}:${startDate}`, op: 'upsert', payload: { ...g, startDate }, coalesce: true });
}

export interface DayView { date: string; entries: Entry[]; totals: Macros; goal: Goal | null }
export async function getDay(userId: string, date: string): Promise<DayView> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM nutrition_entries WHERE user_id = ? AND date = ? AND deleted_at IS NULL ORDER BY created_at', userId, date);
  const entries = rows.map(toEntry);
  return { date, entries, totals: sumMacros(entries), goal: await getGoal(userId, date) };
}

export const profileKey = (userId: string) => `nutrition.profile.${userId}`;
export async function getProfile(userId: string): Promise<Profile | null> { const v = await kvGet(profileKey(userId)); return v ? (JSON.parse(v) as Profile) : null; }
export async function saveProfile(userId: string, p: Profile) { await kvSet(profileKey(userId), JSON.stringify(p)); await enqueueProfile(userId); }
export const estimateFromProfile = (p: Profile): MacroTargets => estimateTargets({ sex: p.sex, age: p.age, heightCm: p.heightCm, weightKg: p.weightKg }, p.activity, p.goal);

const customKey = (userId: string) => `nutrition.customMeals.${userId}`;
export async function getCustomMeals(userId: string): Promise<string[]> { const v = await kvGet(customKey(userId)); return v ? JSON.parse(v) : []; }
export async function addCustomMeal(userId: string, name: string) {
  const n = name.trim(); if (!n) throw new Error('Indica o nome da refeição.');
  const cur = await getCustomMeals(userId);
  if (!cur.some((m) => m.toLowerCase() === n.toLowerCase())) { await kvSet(customKey(userId), JSON.stringify([...cur, n])); await enqueueProfile(userId); }
  return n;
}
