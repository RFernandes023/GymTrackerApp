import { getDb } from '../../database/db';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import type { Exercise } from './types';

interface Row {
  id: string; user_id: string | null; name_pt: string | null; name_en: string; alt_name: string | null;
  primary_muscles: string; secondary_muscles: string; equipment: string; ex_type: string | null;
  description: string | null; instructions: string; images: string; is_custom: number;
}
export const toExercise = (r: Row): Exercise => ({
  id: r.id, userId: r.user_id, namePt: r.name_pt, nameEn: r.name_en, altName: r.alt_name,
  primary: JSON.parse(r.primary_muscles), secondary: JSON.parse(r.secondary_muscles), equipment: r.equipment, type: r.ex_type,
  description: r.description, instructions: JSON.parse(r.instructions), images: JSON.parse(r.images), isCustom: r.is_custom === 1,
});

export interface ExerciseFilter { query?: string; muscle?: string | null; equipment?: string | null; type?: string | null; limit?: number; offset?: number }

export async function searchExercises(userId: string, f: ExerciseFilter = {}): Promise<Exercise[]> {
  const db = await getDb();
  const where = ['deleted_at IS NULL', '(user_id IS NULL OR user_id = ?)'];
  const args: (string | number)[] = [userId];
  const q = f.query?.trim();
  if (q) { where.push('(name_pt LIKE ? OR name_en LIKE ? OR alt_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (f.muscle) { where.push('primary_muscles LIKE ?'); args.push(`%"${f.muscle}"%`); }
  if (f.equipment) { where.push('equipment = ?'); args.push(f.equipment); }
  if (f.type) { where.push('ex_type = ?'); args.push(f.type); }
  args.push(f.limit ?? 60, f.offset ?? 0);
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM exercises WHERE ${where.join(' AND ')} ORDER BY is_custom DESC, (name_pt IS NULL), COALESCE(name_pt, name_en) COLLATE NOCASE LIMIT ? OFFSET ?`, ...args);
  return rows.map(toExercise);
}

export async function getExercise(id: string): Promise<Exercise | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>('SELECT * FROM exercises WHERE id = ?', id);
  return r ? toExercise(r) : null;
}

export interface CustomExerciseInput {
  namePt: string; nameEn?: string; altName?: string; primary: string[]; secondary?: string[]; equipment: string;
  type?: string | null; description?: string; instructions?: string[];
}

export async function createCustomExercise(userId: string, i: CustomExerciseInput): Promise<Exercise> {
  if (!i.namePt.trim()) throw new Error('name_required');
  if (i.primary.length === 0) throw new Error('muscle_required');
  const db = await getDb();
  const id = uuid(), now = Date.now();
  await db.runAsync(
    `INSERT INTO exercises (id, user_id, name_pt, name_en, alt_name, primary_muscles, secondary_muscles, equipment, ex_type, description, instructions, images, source, is_custom, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'[]','custom',1,?,?)`,
    id, userId, i.namePt.trim(), (i.nameEn?.trim() || i.namePt.trim()), i.altName?.trim() || null, JSON.stringify(i.primary),
    JSON.stringify(i.secondary ?? []), i.equipment, i.type ?? null, i.description?.trim() || null, JSON.stringify(i.instructions ?? []), now, now);
  const ex = (await getExercise(id))!;
  await enqueue({ userId, entity: 'custom_exercise', entityId: id, op: 'upsert', payload: ex, coalesce: true });
  return ex;
}
