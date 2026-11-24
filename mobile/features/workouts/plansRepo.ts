import { DEFAULT_CONFIG, GOAL_DEFAULTS, buildSets, defaultIncrement, inferConfig, suggestStartingWeight, validateConfig, type ExerciseConfig, type PlanSetDraft, type SetType } from '@gym/shared';
import { getDb } from '../../database/db';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import { exerciseName, type Plan, type PlanDay, type PlanExercise, type PlanSet } from './types';
import { getExercise } from './exercisesRepo';
import { lastPerformance } from './historyRepo';
import { getBodyInfo } from '../profile/profileRepo';

export { DEFAULT_CONFIG, buildSets, inferConfig, validateConfig, type ExerciseConfig };

export async function listPlans(userId: string): Promise<(Plan & { exerciseCount: number })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM workout_plans WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_active DESC, updated_at DESC', userId);
  const out = [];
  for (const r of rows) {
    const p = (await getPlan(r.id))!;
    out.push({ ...p, exerciseCount: p.days.reduce((n, d) => n + d.exercises.length, 0) });
  }
  return out;
}

export async function getPlan(planId: string): Promise<Plan | null> {
  const db = await getDb();
  const p = await db.getFirstAsync<{ id: string; name: string; description: string | null; goal: Plan['goal']; is_active: number; version: number; updated_at: number }>(
    'SELECT * FROM workout_plans WHERE id = ? AND deleted_at IS NULL', planId);
  if (!p) return null;
  const days = await db.getAllAsync<{ id: string; name: string; day_of_week: number | null; position: number }>('SELECT * FROM plan_days WHERE plan_id = ? ORDER BY position', planId);
  const exs = await db.getAllAsync<{ id: string; day_id: string; exercise_id: string; position: number; weight_increment: number; rest_seconds: number; goal: string | null; notes: string | null; superset_group: string | null; name_pt: string | null; name_en: string | null }>(
    `SELECT pe.*, e.name_pt, e.name_en FROM plan_exercises pe LEFT JOIN exercises e ON e.id = pe.exercise_id
     WHERE pe.day_id IN (SELECT id FROM plan_days WHERE plan_id = ?) ORDER BY pe.position`, planId);
  const sets = await db.getAllAsync<{ id: string; plan_exercise_id: string; position: number; set_type: SetType; rep_min: number; rep_max: number; weight: number; rest_seconds: number | null; rir: number | null }>(
    `SELECT * FROM plan_sets WHERE plan_exercise_id IN (SELECT pe.id FROM plan_exercises pe JOIN plan_days d ON d.id = pe.day_id WHERE d.plan_id = ?) ORDER BY position`, planId);
  const planDays: PlanDay[] = days.map((d) => ({
    id: d.id, name: d.name, dayOfWeek: d.day_of_week, position: d.position,
    exercises: exs.filter((e) => e.day_id === d.id).map((e): PlanExercise => ({
      id: e.id, exerciseId: e.exercise_id, name: e.name_pt ?? e.name_en ?? 'Exercício removido', position: e.position,
      weightIncrement: e.weight_increment, restSeconds: e.rest_seconds, goal: e.goal, notes: e.notes, supersetGroup: e.superset_group,
      sets: sets.filter((s) => s.plan_exercise_id === e.id).map((s) => ({ id: s.id, position: s.position, type: s.set_type, repMin: s.rep_min, repMax: s.rep_max, weight: s.weight, restSeconds: s.rest_seconds, rir: s.rir })),
    })),
  }));
  return { id: p.id, name: p.name, description: p.description, goal: p.goal ?? 'hypertrophy', isActive: p.is_active === 1, version: p.version, updatedAt: p.updated_at, days: planDays };
}

async function owner(planId: string): Promise<string> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ user_id: string }>('SELECT user_id FROM workout_plans WHERE id = ?', planId);
  if (!r) throw new Error('plan_not_found');
  return r.user_id;
}
/** Incrementa a versão (deteção de conflitos concorrentes) e enfileira o estado completo do plano. */
async function touch(planId: string) {
  const db = await getDb();
  await db.runAsync('UPDATE workout_plans SET version = version + 1, updated_at = ? WHERE id = ?', Date.now(), planId);
  const plan = await getPlan(planId);
  if (plan) await enqueue({ userId: await owner(planId), entity: 'workout_plan', entityId: planId, op: 'upsert', payload: plan, coalesce: true });
}
async function writeSets(peId: string, sets: PlanSetDraft[]) {
  const db = await getDb();
  await db.runAsync('DELETE FROM plan_sets WHERE plan_exercise_id = ?', peId);
  for (const s of sets) await db.runAsync('INSERT INTO plan_sets (id, plan_exercise_id, position, set_type, rep_min, rep_max, weight, rest_seconds, rir) VALUES (?,?,?,?,?,?,?,?,?)', uuid(), peId, s.position, s.type, s.repMin, s.repMax, s.weight, s.restSeconds, s.rir);
}

export async function createPlan(userId: string, name: string, description?: string, goal: Plan['goal'] = 'hypertrophy'): Promise<string> {
  if (!name.trim()) throw new Error('name_required');
  const db = await getDb(); const id = uuid(), now = Date.now();
  await db.withTransactionAsync(async () => {
    const hasActive = await db.getFirstAsync('SELECT 1 FROM workout_plans WHERE user_id = ? AND is_active = 1 AND deleted_at IS NULL', userId);
    await db.runAsync('INSERT INTO workout_plans (id, user_id, name, description, goal, is_active, version, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)', id, userId, name.trim(), description?.trim() || null, goal, hasActive ? 0 : 1, now, now);
    await db.runAsync('INSERT INTO plan_days (id, plan_id, name, day_of_week, position) VALUES (?,?,?,NULL,0)', uuid(), id, 'Treino A');
  });
  await touch(id);
  return id;
}
export async function updatePlan(planId: string, patch: { name?: string; description?: string | null; goal?: Plan['goal'] }) {
  const db = await getDb();
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('name_required');
  if (patch.name !== undefined) await db.runAsync('UPDATE workout_plans SET name = ? WHERE id = ?', patch.name.trim(), planId);
  if (patch.description !== undefined) await db.runAsync('UPDATE workout_plans SET description = ? WHERE id = ?', patch.description, planId);
  if (patch.goal !== undefined) await db.runAsync('UPDATE workout_plans SET goal = ? WHERE id = ?', patch.goal, planId);
  await touch(planId);
}
export async function setActivePlan(userId: string, planId: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE workout_plans SET is_active = 0 WHERE user_id = ?', userId);
    await db.runAsync('UPDATE workout_plans SET is_active = 1 WHERE id = ?', planId);
  });
  await touch(planId);
}
export async function deletePlan(planId: string) {
  const db = await getDb(); const userId = await owner(planId);
  await db.runAsync('UPDATE workout_plans SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?', Date.now(), Date.now(), planId);
  await enqueue({ userId, entity: 'workout_plan', entityId: planId, op: 'delete', payload: { id: planId }, coalesce: true });
}
export async function duplicatePlan(planId: string): Promise<string> {
  const src = await getPlan(planId); if (!src) throw new Error('plan_not_found');
  const db = await getDb(); const userId = await owner(planId); const id = uuid(), now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO workout_plans (id, user_id, name, description, goal, is_active, version, created_at, updated_at) VALUES (?,?,?,?,?,0,1,?,?)', id, userId, `${src.name} (cópia)`, src.description, src.goal, now, now);
    for (const d of src.days) {
      const dId = uuid();
      await db.runAsync('INSERT INTO plan_days (id, plan_id, name, day_of_week, position) VALUES (?,?,?,?,?)', dId, id, d.name, d.dayOfWeek, d.position);
      const groups = new Map<string, string>();
      for (const e of d.exercises) {
        const peId = uuid();
        const g = e.supersetGroup ? (groups.get(e.supersetGroup) ?? (groups.set(e.supersetGroup, uuid()), groups.get(e.supersetGroup)!)) : null;
        await db.runAsync('INSERT INTO plan_exercises (id, day_id, exercise_id, position, weight_increment, rest_seconds, goal, notes, superset_group) VALUES (?,?,?,?,?,?,?,?,?)', peId, dId, e.exerciseId, e.position, e.weightIncrement, e.restSeconds, e.goal, e.notes, g);
        await writeSets(peId, e.sets);
      }
    }
  });
  await touch(id);
  return id;
}

export async function addDay(planId: string, name: string) {
  const db = await getDb();
  const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM plan_days WHERE plan_id = ?', planId);
  await db.runAsync('INSERT INTO plan_days (id, plan_id, name, day_of_week, position) VALUES (?,?,?,NULL,?)', uuid(), planId, name.trim() || `Treino ${(n?.n ?? 0) + 1}`, n?.n ?? 0);
  await touch(planId);
}
export async function updateDay(planId: string, dayId: string, patch: { name?: string; dayOfWeek?: number | null }) {
  const db = await getDb();
  if (patch.name !== undefined && patch.name.trim()) await db.runAsync('UPDATE plan_days SET name = ? WHERE id = ?', patch.name.trim(), dayId);
  if (patch.dayOfWeek !== undefined) await db.runAsync('UPDATE plan_days SET day_of_week = ? WHERE id = ?', patch.dayOfWeek, dayId);
  await touch(planId);
}
export async function deleteDay(planId: string, dayId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM plan_days WHERE id = ?', dayId);
  await touch(planId);
}

/**
 * Valores por defeito ao adicionar um exercício a um plano:
 * reps/descanso/séries pelo objetivo do plano; carga = a que já usaste neste exercício (qualquer treino) → senão estimativa pelo teu perfil → senão 0.
 */
export async function defaultConfigFor(userId: string, goal: Plan['goal'], exerciseId: string): Promise<{ config: ExerciseConfig; source: 'history' | 'estimate' | 'none'; note: string | null }> {
  const ex = await getExercise(exerciseId); if (!ex) throw new Error('exercise_not_found');
  const gd = GOAL_DEFAULTS[goal], increment = defaultIncrement(ex.equipment);
  const base: ExerciseConfig = { ...DEFAULT_CONFIG, repMin: gd.repMin, repMax: gd.repMax, restSeconds: gd.restSeconds, sets: gd.sets, goal, increment };
  const last = await lastPerformance(userId, exerciseId);
  const work = last?.sets.filter((s) => s.type === 'working' || s.type === 'failure') ?? [];
  if (work.length) return { config: { ...base, weight: Math.max(...work.map((s) => s.weight)) }, source: 'history', note: 'Carga da tua última sessão com este exercício.' };
  const body = await getBodyInfo(userId);
  const sug = body ? suggestStartingWeight(ex, body, goal, increment) : null;
  if (sug) return { config: { ...base, weight: sug.weight }, source: 'estimate', note: sug.note + (sug.perHand ? ' (valor por haltere)' : '') };
  return { config: base, source: 'none', note: null };
}

export async function addExerciseToDay(planId: string, dayId: string, exerciseId: string, config: Partial<ExerciseConfig> = {}) {
  const ex = await getExercise(exerciseId); if (!ex) throw new Error('exercise_not_found');
  const db = await getDb();
  const plan = await getPlan(planId); if (!plan) throw new Error('plan_not_found');
  const def = await defaultConfigFor(await owner(planId), plan.goal, exerciseId);
  const cfg = { ...def.config, ...config };
  const err = validateConfig(cfg); if (err) throw new Error(err);
  const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM plan_exercises WHERE day_id = ?', dayId);
  const peId = uuid();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO plan_exercises (id, day_id, exercise_id, position, weight_increment, rest_seconds, goal, notes, superset_group) VALUES (?,?,?,?,?,?,?,?,NULL)', peId, dayId, exerciseId, n?.n ?? 0, cfg.increment, cfg.restSeconds, cfg.goal, cfg.notes || null);
    await writeSets(peId, buildSets(cfg));
  });
  await touch(planId);
  return peId;
}
export async function updateExercise(planId: string, peId: string, cfg: ExerciseConfig) {
  const err = validateConfig(cfg); if (err) throw new Error(err);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE plan_exercises SET weight_increment = ?, rest_seconds = ?, goal = ?, notes = ? WHERE id = ?', cfg.increment, cfg.restSeconds, cfg.goal, cfg.notes || null, peId);
    await writeSets(peId, buildSets(cfg));
  });
  await touch(planId);
}
export async function removeExercise(planId: string, peId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM plan_exercises WHERE id = ?', peId);
  await touch(planId);
}
export async function moveExercise(planId: string, dayId: string, peId: string, dir: -1 | 1) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM plan_exercises WHERE day_id = ? ORDER BY position', dayId);
  const i = rows.findIndex((r) => r.id === peId), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  const ids = rows.map((r) => r.id); [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await db.withTransactionAsync(async () => { for (let k = 0; k < ids.length; k++) await db.runAsync('UPDATE plan_exercises SET position = ? WHERE id = ?', k, ids[k]!); });
  await touch(planId);
}
/** Liga/desliga o exercício à superset do exercício anterior. */
export async function toggleSupersetWithPrevious(planId: string, dayId: string, peId: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; superset_group: string | null }>('SELECT id, superset_group FROM plan_exercises WHERE day_id = ? ORDER BY position', dayId);
  const i = rows.findIndex((r) => r.id === peId); if (i < 0) return;
  const cur = rows[i]!, prev = rows[i - 1];
  if (cur.superset_group) {
    await db.runAsync('UPDATE plan_exercises SET superset_group = NULL WHERE id = ?', peId);
    const stillGrouped = rows.filter((r) => r.superset_group === cur.superset_group && r.id !== peId);
    if (stillGrouped.length === 1) await db.runAsync('UPDATE plan_exercises SET superset_group = NULL WHERE id = ?', stillGrouped[0]!.id);
  } else if (prev) {
    const g = prev.superset_group ?? uuid();
    await db.runAsync('UPDATE plan_exercises SET superset_group = ? WHERE id IN (?, ?)', g, prev.id, peId);
  } else return;
  await touch(planId);
}
export { exerciseName };

export interface FullPlanSpec {
  name: string; description: string | null; goal: Plan['goal'];
  days: { name: string; dayOfWeek: number | null; exercises: { exerciseId: string; increment: number; restSeconds: number; goal: string | null; notes: string | null; supersetKey: string | null; sets: PlanSetDraft[] }[] }[];
}

/** Cria um plano completo (dias, exercícios e séries exatas) numa única transação: ou entra tudo ou nada. */
export async function insertFullPlan(userId: string, spec: FullPlanSpec): Promise<string> {
  if (!spec.name.trim()) throw new Error('name_required');
  if (spec.days.length === 0) throw new Error('Plano sem dias.');
  const db = await getDb(); const id = uuid(), now = Date.now();
  await db.withTransactionAsync(async () => {
    const hasActive = await db.getFirstAsync('SELECT 1 FROM workout_plans WHERE user_id = ? AND is_active = 1 AND deleted_at IS NULL', userId);
    await db.runAsync('INSERT INTO workout_plans (id, user_id, name, description, goal, is_active, version, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)', id, userId, spec.name.trim(), spec.description?.trim() || null, spec.goal, hasActive ? 0 : 1, now, now);
    for (const [di, d] of spec.days.entries()) {
      const dayId = uuid();
      await db.runAsync('INSERT INTO plan_days (id, plan_id, name, day_of_week, position) VALUES (?,?,?,?,?)', dayId, id, d.name, d.dayOfWeek, di);
      const counts = new Map<string, number>(); for (const e of d.exercises) if (e.supersetKey) counts.set(e.supersetKey, (counts.get(e.supersetKey) ?? 0) + 1);
      const groups = new Map<string, string>();
      for (const [ei, e] of d.exercises.entries()) {
        const g = e.supersetKey && (counts.get(e.supersetKey) ?? 0) > 1 ? (groups.get(e.supersetKey) ?? (groups.set(e.supersetKey, uuid()), groups.get(e.supersetKey)!)) : null;
        const peId = uuid();
        await db.runAsync('INSERT INTO plan_exercises (id, day_id, exercise_id, position, weight_increment, rest_seconds, goal, notes, superset_group) VALUES (?,?,?,?,?,?,?,?,?)', peId, dayId, e.exerciseId, ei, e.increment, e.restSeconds, e.goal, e.notes, g);
        await writeSets(peId, e.sets.map((s, i) => ({ ...s, position: i })));
      }
    }
  });
  await touch(id);
  return id;
}

/** Volta a enfileirar o estado atual do plano (sem alterar a versão local). Usado ao resolver conflitos. */
export async function resyncPlan(planId: string) {
  const plan = await getPlan(planId);
  if (plan) await enqueue({ userId: await owner(planId), entity: 'workout_plan', entityId: planId, op: 'upsert', payload: plan, coalesce: true });
}
