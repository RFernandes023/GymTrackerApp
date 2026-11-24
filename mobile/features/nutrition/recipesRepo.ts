import { perServing, recipeTotals, type Macros, type QuantityUnit } from '@gym/shared';
import { getDb } from '../../database/db';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import { getFood } from './foodsRepo';
import { snapshotFor } from './nutritionRepo';
import { roundMacros, scaleMacrosExact } from '@gym/shared';

export interface Ingredient { id: string; foodId: string | null; name: string; quantity: number; unit: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number; amount?: number | null; perUnit?: Macros }
export interface Recipe {
  id: string; name: string; servings: number; notes: string | null; isFavorite: boolean; isMealPrep: boolean; remainingPortions: number | null;
  ingredients: Ingredient[]; totals: Macros; perServing: Macros;
}

export async function getRecipe(userId: string, id: string): Promise<Recipe | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<any>('SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL', id, userId);
  if (!r) return null;
  const rows = await db.getAllAsync<any>('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position', id);
  const ingredients: Ingredient[] = rows.map((x) => ({ id: x.id, foodId: x.food_id, name: x.name, quantity: x.quantity, unit: x.unit, kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat, fiber: x.fiber, amount: x.amount ?? null, perUnit: x.per_unit ? JSON.parse(x.per_unit) : undefined }));
  const totals = recipeTotals(ingredients);
  return { id: r.id, name: r.name, servings: r.servings, notes: r.notes, isFavorite: r.is_favorite === 1, isMealPrep: r.is_meal_prep === 1, remainingPortions: r.remaining_portions, ingredients, totals, perServing: perServing(totals, r.servings) };
}

export async function listRecipes(userId: string, favoritesOnly = false): Promise<Recipe[]> {
  const db = await getDb();
  const ids = await db.getAllAsync<{ id: string }>(`SELECT id FROM recipes WHERE user_id = ? AND deleted_at IS NULL ${favoritesOnly ? 'AND is_favorite = 1' : ''} ORDER BY is_favorite DESC, name COLLATE NOCASE`, userId);
  return (await Promise.all(ids.map((r) => getRecipe(userId, r.id)))).filter((r): r is Recipe => !!r);
}

async function sync(userId: string, id: string) {
  const r = await getRecipe(userId, id);
  if (r) await enqueue({ userId, entity: 'recipe', entityId: id, op: 'upsert', payload: r, coalesce: true });
}
async function touch(userId: string, id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE recipes SET updated_at = ? WHERE id = ?', Date.now(), id);
  await sync(userId, id);
}

export async function createRecipe(userId: string, name: string, servings = 1): Promise<string> {
  if (!name.trim()) throw new Error('Indica o nome da receita.');
  if (!(servings > 0)) throw new Error('O número de doses deve ser maior que 0.');
  const db = await getDb(); const id = uuid(), now = Date.now();
  await db.runAsync('INSERT INTO recipes (id, user_id, name, servings, created_at, updated_at) VALUES (?,?,?,?,?,?)', id, userId, name.trim(), servings, now, now);
  await sync(userId, id);
  return id;
}
export async function updateRecipe(userId: string, id: string, p: { name?: string; servings?: number; notes?: string | null; isFavorite?: boolean; isMealPrep?: boolean; remainingPortions?: number | null }) {
  const db = await getDb();
  if (p.name !== undefined) { if (!p.name.trim()) throw new Error('Indica o nome da receita.'); await db.runAsync('UPDATE recipes SET name = ? WHERE id = ? AND user_id = ?', p.name.trim(), id, userId); }
  if (p.servings !== undefined) { if (!(p.servings > 0)) throw new Error('O número de doses deve ser maior que 0.'); await db.runAsync('UPDATE recipes SET servings = ? WHERE id = ? AND user_id = ?', p.servings, id, userId); }
  if (p.notes !== undefined) await db.runAsync('UPDATE recipes SET notes = ? WHERE id = ? AND user_id = ?', p.notes, id, userId);
  if (p.isFavorite !== undefined) await db.runAsync('UPDATE recipes SET is_favorite = ? WHERE id = ? AND user_id = ?', p.isFavorite ? 1 : 0, id, userId);
  if (p.isMealPrep !== undefined) await db.runAsync('UPDATE recipes SET is_meal_prep = ? WHERE id = ? AND user_id = ?', p.isMealPrep ? 1 : 0, id, userId);
  if (p.remainingPortions !== undefined) await db.runAsync('UPDATE recipes SET remaining_portions = ? WHERE id = ? AND user_id = ?', p.remainingPortions, id, userId);
  await touch(userId, id);
}
export async function deleteRecipe(userId: string, id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE recipes SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', Date.now(), Date.now(), id, userId);
  await enqueue({ userId, entity: 'recipe', entityId: id, op: 'delete', payload: { id }, coalesce: true });
}
export async function duplicateRecipe(userId: string, id: string): Promise<string> {
  const src = await getRecipe(userId, id); if (!src) throw new Error('Receita não encontrada.');
  const db = await getDb(); const nid = uuid(), now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO recipes (id, user_id, name, servings, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', nid, userId, `${src.name} (cópia)`, src.servings, src.notes, now, now);
    for (const [i, x] of src.ingredients.entries()) {
      const old = await db.getFirstAsync<any>('SELECT * FROM recipe_ingredients WHERE id = ?', x.id);
      await db.runAsync('INSERT INTO recipe_ingredients (id, recipe_id, food_id, name, quantity, unit, amount, kcal, protein, carbs, fat, fiber, per_unit, position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', uuid(), nid, old.food_id, old.name, old.quantity, old.unit, old.amount, old.kcal, old.protein, old.carbs, old.fat, old.fiber, old.per_unit, i);
    }
  });
  await sync(userId, nid);
  return nid;
}

export async function addIngredient(userId: string, recipeId: string, foodId: string, quantity: number, unit: QuantityUnit) {
  const food = await getFood(userId, foodId); if (!food) throw new Error('Alimento não encontrado.');
  const snap = snapshotFor(food, quantity, unit);
  const db = await getDb();
  const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM recipe_ingredients WHERE recipe_id = ?', recipeId);
  const m = snap.macros;
  await db.runAsync('INSERT INTO recipe_ingredients (id, recipe_id, food_id, name, quantity, unit, amount, kcal, protein, carbs, fat, fiber, per_unit, position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', uuid(), recipeId, foodId, food.name, quantity, unit, snap.amount, m.kcal, m.protein, m.carbs, m.fat, m.fiber, JSON.stringify(snap.perUnit), n?.n ?? 0);
  await touch(userId, recipeId);
}
export async function updateIngredientQuantity(userId: string, recipeId: string, ingredientId: string, quantity: number) {
  if (!(quantity > 0)) throw new Error('Quantidade inválida.');
  const db = await getDb();
  const x = await db.getFirstAsync<any>('SELECT per_unit FROM recipe_ingredients WHERE id = ? AND recipe_id = ?', ingredientId, recipeId);
  if (!x) throw new Error('Ingrediente não encontrado.');
  const m = roundMacros(scaleMacrosExact(JSON.parse(x.per_unit), quantity));
  await db.runAsync('UPDATE recipe_ingredients SET quantity=?, kcal=?, protein=?, carbs=?, fat=?, fiber=? WHERE id=?', quantity, m.kcal, m.protein, m.carbs, m.fat, m.fiber, ingredientId);
  await touch(userId, recipeId);
}
export async function removeIngredient(userId: string, recipeId: string, ingredientId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM recipe_ingredients WHERE id = ? AND recipe_id = ?', ingredientId, recipeId);
  await touch(userId, recipeId);
}
/** Meal prep: cozinhou-se um lote; passa a haver `portions` doses disponíveis. */
export async function cookBatch(userId: string, recipeId: string, portions: number) {
  if (!(portions > 0)) throw new Error('Indica o número de doses.');
  await updateRecipe(userId, recipeId, { isMealPrep: true, remainingPortions: portions });
}
