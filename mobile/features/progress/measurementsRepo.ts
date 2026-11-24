import { deriveMetrics, filterRange, isDateKey, monthlyComparison, toDateKey, trend, validateMeasurement, isoWeekStart, type MeasurementInput, type Point } from '@gym/shared';
import { getDb } from '../../database/db';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import { getBodyInfo, syncProfileWeight } from '../profile/profileRepo';
import { getProfile } from '../nutrition/nutritionRepo';
import { getDay } from '../nutrition/nutritionRepo';

export interface Measurement {
  id: string; date: string; weight: number | null; bodyFat: number | null; bodyFatSource: 'estimate' | 'measured' | null;
  muscleMass: number | null; muscleSource: 'estimate' | 'measured' | null; bmi: number | null;
  neck: number | null; waist: number | null; hip: number | null; chest: number | null; arms: number | null; forearms: number | null; thighs: number | null; calves: number | null;
  custom: Record<string, number>; notes: string | null;
}
export type MeasurementForm = MeasurementInput & { date: string; custom?: Record<string, number>; notes?: string | null };

const toM = (r: any): Measurement => ({
  id: r.id, date: r.date, weight: r.weight, bodyFat: r.body_fat, bodyFatSource: r.body_fat_source, muscleMass: r.muscle_mass, muscleSource: r.muscle_source, bmi: r.bmi,
  neck: r.neck, waist: r.waist, hip: r.hip, chest: r.chest, arms: r.arms, forearms: r.forearms, thighs: r.thighs, calves: r.calves, custom: JSON.parse(r.custom ?? '{}'), notes: r.notes,
});

export const BUILTIN_METRICS = ['weight', 'bmi', 'bodyFat', 'muscleMass', 'waist', 'chest', 'arms', 'forearms', 'thighs', 'calves', 'neck', 'hip'] as const;
export type Metric = (typeof BUILTIN_METRICS)[number] | `custom:${string}`;
export const METRIC_LABELS: Record<string, string> = { weight: 'Peso (kg)', bmi: 'IMC', bodyFat: '% Gordura', muscleMass: 'Músculo (kg)', waist: 'Cintura (cm)', chest: 'Peito (cm)', arms: 'Braços (cm)', forearms: 'Antebraços (cm)', thighs: 'Coxas (cm)', calves: 'Gémeos (cm)', neck: 'Pescoço (cm)', hip: 'Anca (cm)' };

export async function getMeasurement(userId: string, id: string) {
  const db = await getDb();
  const r = await db.getFirstAsync('SELECT * FROM body_measurements WHERE id = ? AND user_id = ? AND deleted_at IS NULL', id, userId);
  return r ? toM(r) : null;
}
export async function listMeasurements(userId: string, limit = 200): Promise<Measurement[]> {
  const db = await getDb();
  return (await db.getAllAsync('SELECT * FROM body_measurements WHERE user_id = ? AND deleted_at IS NULL ORDER BY date DESC LIMIT ?', userId, limit)).map(toM);
}
export const latestMeasurement = async (userId: string) => (await listMeasurements(userId, 1))[0] ?? null;

/** Cria ou atualiza o registo do dia. IMC é sempre calculado; gordura/músculo são estimados (e marcados) quando não medidos. */
export async function saveMeasurement(userId: string, f: MeasurementForm, id?: string): Promise<Measurement> {
  if (!isDateKey(f.date)) throw new Error('Data inválida.');
  if (f.date > toDateKey(Date.now())) throw new Error('A data não pode ser futura.');
  const err = validateMeasurement(f);
  const custom = f.custom ?? {};
  if (err && Object.keys(custom).length === 0) throw new Error(err);
  if (Object.keys(custom).length > 5) throw new Error('No máximo 5 medidas personalizadas por registo.');
  for (const [k, v] of Object.entries(custom)) if (!k.trim() || k.length > 30 || !(v > 0 && v < 1000)) throw new Error('Medida personalizada inválida.');
  const body = await getBodyInfo(userId) ?? await getProfile(userId);
  const prof = body ? { sex: body.sex, age: body.age, heightCm: body.heightCm } : null;
  const d = deriveMetrics(f, prof);
  const db = await getDb(); const now = Date.now();
  const same = await db.getFirstAsync<{ id: string }>('SELECT id FROM body_measurements WHERE user_id = ? AND date = ? AND deleted_at IS NULL', userId, f.date);
  if (same && id && same.id !== id) throw new Error('Já existe um registo nessa data.');
  const rid = id ?? same?.id ?? uuid();
  const vals = [f.date, f.weight ?? null, d.bodyFat, d.bodyFatSource, d.muscleMass, d.muscleSource, d.bmi, f.neck ?? null, f.waist ?? null, f.hip ?? null, f.chest ?? null, f.arms ?? null, f.forearms ?? null, f.thighs ?? null, f.calves ?? null, JSON.stringify(custom), f.notes?.trim() || null];
  const exists = await db.getFirstAsync('SELECT 1 FROM body_measurements WHERE id = ? AND user_id = ? AND deleted_at IS NULL', rid, userId);
  if (exists) await db.runAsync('UPDATE body_measurements SET date=?, weight=?, body_fat=?, body_fat_source=?, muscle_mass=?, muscle_source=?, bmi=?, neck=?, waist=?, hip=?, chest=?, arms=?, forearms=?, thighs=?, calves=?, custom=?, notes=?, updated_at=? WHERE id=? AND user_id=?', ...vals, now, rid, userId);
  else await db.runAsync('INSERT INTO body_measurements (date, weight, body_fat, body_fat_source, muscle_mass, muscle_source, bmi, neck, waist, hip, chest, arms, forearms, thighs, calves, custom, notes, id, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ...vals, rid, userId, now, now);
  await syncProfileWeight(userId);
  const m = (await getMeasurement(userId, rid))!;
  await enqueue({ userId, entity: 'body_measurement', entityId: rid, op: 'upsert', payload: m, coalesce: true });
  return m;
}

export async function deleteMeasurement(userId: string, id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE body_measurements SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', Date.now(), Date.now(), id, userId);
  await syncProfileWeight(userId);
  await enqueue({ userId, entity: 'body_measurement', entityId: id, op: 'delete', payload: { id }, coalesce: true });
}

export function pointsFor(list: Measurement[], metric: Metric): Point[] {
  const out: Point[] = [];
  for (const m of list) {
    const v = metric.startsWith('custom:') ? m.custom[metric.slice(7)] : (m as any)[metric];
    if (typeof v === 'number') out.push({ date: m.date, value: v });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export const customMetricNames = (list: Measurement[]) => Array.from(new Set(list.flatMap((m) => Object.keys(m.custom))));

export async function metricSeries(userId: string, metric: Metric, days: number | null, now = Date.now()) {
  return filterRange(pointsFor(await listMeasurements(userId, 2000), metric), days, now);
}
export async function monthly(userId: string, metric: Metric, now = Date.now()) {
  return monthlyComparison(pointsFor(await listMeasurements(userId, 2000), metric), now);
}

export interface WeeklySummary {
  workouts: number; prevWorkouts: number; volume: number; prevVolume: number;
  kcalAvg: number | null; proteinAvg: number | null; daysLogged: number; goalKcal: number | null; weightDelta: number | null;
}
/** Resumo da semana (segunda → hoje) vs. semana anterior. Só usa dados reais registados. */
export async function weeklySummary(userId: string, now = Date.now()): Promise<WeeklySummary> {
  const db = await getDb();
  const ws = isoWeekStart(now); const p = new Date(ws); p.setDate(p.getDate() - 7); const pws = p.getTime();
  const q = async (from: number, to: number) => db.getFirstAsync<{ n: number; v: number | null }>("SELECT COUNT(*) AS n, SUM(total_volume) AS v FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND completed_at >= ? AND completed_at < ?", userId, from, to);
  const cur = await q(ws, now + 1), prev = await q(pws, ws);
  const kcal: number[] = [], prot: number[] = []; let goal: number | null = null;
  for (let t = ws; t <= now; ) {
    const day = await getDay(userId, toDateKey(t));
    if (day.entries.length) { kcal.push(day.totals.kcal); prot.push(day.totals.protein); }
    goal = day.goal?.calories ?? goal;
    const d = new Date(t); d.setDate(d.getDate() + 1); t = d.getTime();
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const tr = trend(pointsFor(await listMeasurements(userId, 200), 'weight'), 14, now);
  return { workouts: cur?.n ?? 0, prevWorkouts: prev?.n ?? 0, volume: cur?.v ?? 0, prevVolume: prev?.v ?? 0, kcalAvg: avg(kcal), proteinAvg: avg(prot), daysLogged: kcal.length, goalKcal: goal, weightDelta: tr?.delta ?? null };
}
