import { validatePer100, type FoodDraft } from '@gym/shared';
import { getDb } from '../../database/db';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import type { FoodRecord } from './types';

const toFood = (r: any): FoodRecord => ({
  id: r.id, name: r.name, brand: r.brand, barcode: r.barcode, source: r.source, baseUnit: r.base_unit,
  per100: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, satFat: r.sat_fat, sugars: r.sugars, fiber: r.fiber, salt: r.salt },
  servingSize: r.serving_size, servingLabel: r.serving_label, unitWeight: r.unit_weight, isFavorite: r.is_favorite === 1, lastUsedAt: r.last_used_at,
});

export async function getFood(userId: string, id: string): Promise<FoodRecord | null> {
  const db = await getDb();
  const r = await db.getFirstAsync('SELECT * FROM foods WHERE id = ? AND user_id = ? AND deleted_at IS NULL', id, userId);
  return r ? toFood(r) : null;
}
export async function findByBarcode(userId: string, barcode: string): Promise<FoodRecord | null> {
  const db = await getDb();
  const r = await db.getFirstAsync('SELECT * FROM foods WHERE user_id = ? AND barcode = ? AND deleted_at IS NULL', userId, barcode.trim());
  return r ? toFood(r) : null;
}

export async function searchFoods(userId: string, o: { query?: string; favorites?: boolean; recent?: boolean; limit?: number } = {}): Promise<FoodRecord[]> {
  const db = await getDb();
  const where = ['user_id = ?', 'deleted_at IS NULL']; const args: (string | number)[] = [userId];
  if (o.query?.trim()) { where.push('(name LIKE ? OR brand LIKE ? OR barcode = ?)'); args.push(`%${o.query.trim()}%`, `%${o.query.trim()}%`, o.query.trim()); }
  if (o.favorites) where.push('is_favorite = 1');
  if (o.recent) where.push('last_used_at IS NOT NULL');
  args.push(o.limit ?? 50);
  const order = o.recent ? 'last_used_at DESC' : 'name COLLATE NOCASE';
  return (await db.getAllAsync(`SELECT * FROM foods WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`, ...args)).map(toFood);
}

export interface SaveFoodInput extends FoodDraft { id?: string; source: FoodRecord['source'] }

/** Cria/atualiza um alimento (valores por 100 g/ml). Rejeita valores impossíveis; nunca guarda dados não confirmados pela UI. */
export async function saveFood(userId: string, i: SaveFoodInput): Promise<FoodRecord> {
  if (!i.name.trim()) throw new Error('Indica o nome do alimento.');
  const v = validatePer100(i.per100);
  if (v.errors.length) throw new Error(v.errors[0]);
  if (i.servingSize != null && !(i.servingSize > 0)) throw new Error('Tamanho da dose inválido.');
  if (i.unitWeight != null && !(i.unitWeight > 0)) throw new Error('Peso da unidade inválido.');
  const db = await getDb(); const now = Date.now();
  let id = i.id ?? null;
  if (!id && i.barcode) id = (await findByBarcode(userId, i.barcode))?.id ?? null; // evita duplicar produtos lidos duas vezes
  const p = i.per100;
  const vals = [i.name.trim(), i.brand?.trim() || null, i.barcode?.trim() || null, i.source, i.baseUnit, p.kcal, p.protein, p.carbs, p.fat, p.satFat ?? null, p.sugars ?? null, p.fiber ?? null, p.salt ?? null, i.servingSize, i.servingLabel, i.unitWeight];
  if (id) {
    await db.runAsync(`UPDATE foods SET name=?, brand=?, barcode=?, source=?, base_unit=?, kcal=?, protein=?, carbs=?, fat=?, sat_fat=?, sugars=?, fiber=?, salt=?, serving_size=?, serving_label=?, unit_weight=?, updated_at=? WHERE id=? AND user_id=?`, ...vals, now, id, userId);
  } else {
    id = uuid();
    await db.runAsync(`INSERT INTO foods (name, brand, barcode, source, base_unit, kcal, protein, carbs, fat, sat_fat, sugars, fiber, salt, serving_size, serving_label, unit_weight, id, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, id, userId, now, now);
  }
  const food = (await getFood(userId, id))!;
  await enqueue({ userId, entity: 'food', entityId: id, op: 'upsert', payload: food, coalesce: true });
  return food;
}

export async function setFavorite(userId: string, foodId: string, fav: boolean) {
  const db = await getDb();
  await db.runAsync('UPDATE foods SET is_favorite = ?, updated_at = ? WHERE id = ? AND user_id = ?', fav ? 1 : 0, Date.now(), foodId, userId);
  const f = await getFood(userId, foodId);
  if (f) await enqueue({ userId, entity: 'food', entityId: foodId, op: 'upsert', payload: f, coalesce: true });
}
export async function touchFood(userId: string, foodId: string) {
  const db = await getDb();
  await db.runAsync('UPDATE foods SET last_used_at = ? WHERE id = ? AND user_id = ?', Date.now(), foodId, userId);
}
export async function deleteFood(userId: string, foodId: string) {
  const db = await getDb();
  await db.runAsync('UPDATE foods SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', Date.now(), Date.now(), foodId, userId);
  await enqueue({ userId, entity: 'food', entityId: foodId, op: 'delete', payload: { id: foodId }, coalesce: true });
}
