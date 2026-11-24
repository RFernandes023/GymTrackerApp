import { GOAL_DEFAULTS, defaultIncrement, detectPersonalRecords, nextDropWeight, nextTarget, restAfter, suggestStartingWeight, totalVolume, type FlowExercise, type LoggedSet, type SetType, type TrainingGoal } from '@gym/shared';
import { getDb } from '../../database/db';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import { getPlan } from './plansRepo';
import { getExercise } from './exercisesRepo';
import { lastPerformance, type LastPerformance } from './historyRepo';
import { suggestionFor } from './suggest';
import { getBodyInfo } from '../profile/profileRepo';
import type { PlanDay, Session, SessionExercise, SessionSet, SessionSummary } from './types';

interface SetRow { id: string; session_exercise_id: string; position: number; set_type: SetType; target_rep_min: number; target_rep_max: number; weight: number; reps: number; rir: number | null; rpe: number | null; rest_seconds: number; completed: number; started_at: number | null; completed_at: number | null; duration_ms: number | null; is_extra: number }

const toSet = (r: SetRow): SessionSet => ({
  id: r.id, position: r.position, type: r.set_type, targetRepMin: r.target_rep_min, targetRepMax: r.target_rep_max, weight: r.weight, reps: r.reps,
  rir: r.rir, rpe: r.rpe, restSeconds: r.rest_seconds, completed: r.completed === 1, startedAt: r.started_at, completedAt: r.completed_at, durationMs: r.duration_ms, isExtra: r.is_extra === 1,
});

export async function getSession(sessionId: string): Promise<Session | null> {
  const db = await getDb();
  const s = await db.getFirstAsync<any>('SELECT * FROM workout_sessions WHERE id = ?', sessionId);
  if (!s) return null;
  const exs = await db.getAllAsync<any>('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY position', sessionId);
  const sets = await db.getAllAsync<SetRow>('SELECT * FROM session_sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?) ORDER BY position', sessionId);
  const exercises: SessionExercise[] = exs.map((e) => ({
    id: e.id, exerciseId: e.exercise_id, position: e.position, name: e.name, weightIncrement: e.weight_increment, restSeconds: e.rest_seconds,
    repMin: e.rep_min, repMax: e.rep_max, supersetGroup: e.superset_group, notes: e.notes, sets: sets.filter((x) => x.session_exercise_id === e.id).map(toSet),
  }));
  return {
    id: s.id, planId: s.plan_id, planDayId: s.plan_day_id, name: s.name, status: s.status, startedAt: s.started_at, completedAt: s.completed_at,
    durationMs: s.duration_ms, totalVolume: s.total_volume, restEndsAt: s.rest_ends_at, restTotalMs: s.rest_total_ms ?? null, summary: s.summary_json ? JSON.parse(s.summary_json) : null, exercises,
  };
}

export async function getActiveSessionId(userId: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ id: string }>("SELECT id FROM workout_sessions WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1", userId);
  return r?.id ?? null;
}

async function insertSessionExercise(sessionId: string, position: number, e: { exerciseId: string; name: string; increment: number; rest: number; repMin: number; repMax: number; group: string | null; notes: string | null },
  sets: { type: SetType; repMin: number; repMax: number; weight: number; reps: number; rest: number }[]) {
  const db = await getDb(); const id = uuid();
  await db.runAsync('INSERT INTO session_exercises (id, session_id, exercise_id, position, name, weight_increment, rest_seconds, rep_min, rep_max, superset_group, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, sessionId, e.exerciseId, position, e.name, e.increment, e.rest, e.repMin, e.repMax, e.group, e.notes);
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i]!;
    await db.runAsync('INSERT INTO session_sets (id, session_exercise_id, position, set_type, target_rep_min, target_rep_max, weight, reps, rest_seconds) VALUES (?,?,?,?,?,?,?,?,?)', uuid(), id, i, s.type, s.repMin, s.repMax, s.weight, s.reps, s.rest);
  }
}

export interface PlannedSet { type: SetType; repMin: number; repMax: number; weight: number; reps: number; rest: number; source: 'history' | 'estimate' | 'plan' }
export interface PlannedExercise {
  planExerciseId: string; exerciseId: string; name: string; increment: number; rest: number; repMin: number; repMax: number; group: string | null; notes: string | null;
  sets: PlannedSet[]; hasHistory: boolean; estimateNote: string | null;
}

/**
 * Séries previstas de um dia de plano, já com os valores iniciais:
 * 1.º histórico real (última sessão, mesmo tipo/posição) → 2.º carga definida no plano → 3.º estimativa para o teu peso/idade/objetivo (1.ª vez).
 * Usado tanto na pré-visualização como ao iniciar o treino.
 */
export async function planSessionExercises(userId: string, day: PlanDay, goal: TrainingGoal): Promise<PlannedExercise[]> {
  const body = await getBodyInfo(userId);
  const out: PlannedExercise[] = [];
  for (const e of day.exercises) {
    const last = await lastPerformance(userId, e.exerciseId);
    const exercise = await getExercise(e.exerciseId);
    const planHasWeight = e.sets.some((s) => s.weight > 0);
    const sug = !last && !planHasWeight && exercise && body ? suggestStartingWeight(exercise, body, goal, e.weightIncrement) : null;
    const counters: Partial<Record<SetType, number>> = {};
    const first = e.sets.find((s) => s.type === 'working') ?? e.sets[0];
    const sets = e.sets.map((s): PlannedSet => {
      const k = counters[s.type] ?? 0; counters[s.type] = k + 1;
      const pool = last?.sets.filter((x) => x.type === s.type) ?? [];
      const hit = pool[k] ?? pool.at(-1);
      const rest = s.restSeconds ?? e.restSeconds;
      if (hit) return { type: s.type, repMin: s.repMin, repMax: s.repMax, weight: hit.weight, reps: hit.reps, rest, source: 'history' };
      if (s.weight > 0) return { type: s.type, repMin: s.repMin, repMax: s.repMax, weight: s.weight, reps: s.repMin, rest, source: 'plan' };
      if (sug) {
        const step = e.weightIncrement > 0 ? e.weightIncrement : 2.5;
        const w = s.type === 'warmup' ? Math.max(step, Math.round((sug.weight * 0.5) / step) * step) : s.type === 'drop' ? Math.max(step, Math.floor((sug.weight * 0.8) / step) * step) : sug.weight;
        return { type: s.type, repMin: s.repMin, repMax: s.repMax, weight: w, reps: s.repMin, rest, source: 'estimate' };
      }
      return { type: s.type, repMin: s.repMin, repMax: s.repMax, weight: 0, reps: s.repMin, rest, source: 'plan' };
    });
    out.push({ planExerciseId: e.id, exerciseId: e.exerciseId, name: e.name, increment: e.weightIncrement, rest: e.restSeconds, repMin: first?.repMin ?? 8, repMax: first?.repMax ?? 12, group: e.supersetGroup, notes: e.notes, sets, hasHistory: !!last, estimateNote: sug ? sug.note + (sug.perHand ? ' (valor por haltere)' : '') : null });
  }
  return out;
}

export async function startSession(userId: string, planId: string | null, dayId: string | null): Promise<string> {
  const db = await getDb();
  const existing = await getActiveSessionId(userId);
  if (existing) return existing;
  const id = uuid(), now = Date.now();
  let name = 'Treino livre', version: number | null = null;
  const plan = planId ? await getPlan(planId) : null;
  const day = plan?.days.find((d) => d.id === dayId);
  if (plan && day) { name = `${plan.name} — ${day.name}`; version = plan.version; }
  const planned = day ? await planSessionExercises(userId, day, plan!.goal) : [];
  await db.withTransactionAsync(async () => {
    await db.runAsync("INSERT INTO workout_sessions (id, user_id, plan_id, plan_day_id, plan_version, name, status, started_at, created_at, updated_at) VALUES (?,?,?,?,?,?,'active',?,?,?)", id, userId, plan?.id ?? null, day?.id ?? null, version, name, now, now, now);
    for (const [i, e] of planned.entries()) {
      await insertSessionExercise(id, i, { exerciseId: e.exerciseId, name: e.name, increment: e.increment, rest: e.rest, repMin: e.repMin, repMax: e.repMax, group: e.group, notes: e.notes },
        e.sets.map((s) => ({ type: s.type, repMin: s.repMin, repMax: s.repMax, weight: s.weight, reps: s.reps, rest: s.rest })));
    }
    // a 1.ª série começa agora
    await db.runAsync('UPDATE session_sets SET started_at = ? WHERE id = (SELECT ss.id FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id WHERE se.session_id = ? ORDER BY se.position, ss.position LIMIT 1)', now, id);
  });
  return id;
}

export async function addExerciseToSession(userId: string, sessionId: string, exerciseId: string) {
  const ex = await getExercise(exerciseId); if (!ex) throw new Error('exercise_not_found');
  const db = await getDb();
  const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM session_exercises WHERE session_id = ?', sessionId);
  const g = await db.getFirstAsync<{ goal: string }>('SELECT p.goal FROM workout_sessions s JOIN workout_plans p ON p.id = s.plan_id WHERE s.id = ?', sessionId);
  const goal = (g?.goal ?? 'hypertrophy') as TrainingGoal, gd = GOAL_DEFAULTS[goal];
  const inc = defaultIncrement(ex.equipment);
  const last = await lastPerformance(userId, exerciseId, sessionId);
  const w = last?.sets.filter((s) => s.type === 'working') ?? [];
  const body = await getBodyInfo(userId);
  const sug = !last && body ? suggestStartingWeight(ex, body, goal, inc) : null;
  const sets = Array.from({ length: gd.sets }, (_, i) => ({ type: 'working' as SetType, repMin: gd.repMin, repMax: gd.repMax, weight: (w[i] ?? w.at(-1))?.weight ?? sug?.weight ?? 0, reps: (w[i] ?? w.at(-1))?.reps ?? gd.repMin, rest: gd.restSeconds }));
  await db.withTransactionAsync(async () => {
    await insertSessionExercise(sessionId, n?.n ?? 0, { exerciseId, name: ex.namePt ?? ex.nameEn, increment: inc, rest: gd.restSeconds, repMin: gd.repMin, repMax: gd.repMax, group: null, notes: null }, sets);
  });
}

export async function updateSet(setId: string, patch: { weight?: number; reps?: number; rir?: number | null; rpe?: number | null }) {
  const db = await getDb();
  if (patch.weight !== undefined) await db.runAsync('UPDATE session_sets SET weight = ? WHERE id = ?', Math.max(0, patch.weight), setId);
  if (patch.reps !== undefined) await db.runAsync('UPDATE session_sets SET reps = ? WHERE id = ?', Math.max(0, Math.round(patch.reps)), setId);
  if (patch.rir !== undefined) await db.runAsync('UPDATE session_sets SET rir = ? WHERE id = ?', patch.rir, setId);
  if (patch.rpe !== undefined) await db.runAsync('UPDATE session_sets SET rpe = ? WHERE id = ?', patch.rpe, setId);
}

const toFlow = (s: Session): FlowExercise[] => s.exercises.map((e) => ({ id: e.id, supersetGroup: e.supersetGroup, sets: e.sets.map((x) => ({ id: x.id, completed: x.completed, type: x.type, restSeconds: x.restSeconds })) }));
export const currentTarget = (s: Session) => nextTarget(toFlow(s));

/** Conclui a série: guarda de imediato, calcula duração, decide o descanso e prepara a próxima série. Devolve os segundos de descanso. */
export async function completeSet(sessionId: string, setId: string): Promise<number> {
  const db = await getDb();
  const before = await getSession(sessionId); if (!before || before.status !== 'active') throw new Error('session_not_active');
  const ex = before.exercises.find((e) => e.sets.some((s) => s.id === setId)); if (!ex) throw new Error('set_not_found');
  const set = ex.sets.find((s) => s.id === setId)!;
  if (set.completed) return 0;
  if (set.reps < 1) throw new Error('reps_required');
  const now = Date.now();
  const startedAt = set.startedAt ?? before.startedAt;
  let rest = 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE session_sets SET completed = 1, completed_at = ?, started_at = ?, duration_ms = ? WHERE id = ?', now, startedAt, Math.max(0, now - startedAt), setId);
    await db.runAsync('UPDATE session_exercises SET started_at = COALESCE(started_at, ?) WHERE id = ?', startedAt, ex.id);
    const mid = (await getSession(sessionId))!;
    rest = restAfter(toFlow(mid), ex.id, setId);
    const idx = ex.sets.findIndex((s) => s.id === setId);
    const nxt = ex.sets[idx + 1];
    // drop set seguinte: a carga sugerida desce automaticamente (editável)
    if (nxt && !nxt.completed && nxt.type === 'drop') await db.runAsync('UPDATE session_sets SET weight = ? WHERE id = ?', nextDropWeight(set.weight, ex.weightIncrement), nxt.id);
    const target = nextTarget(toFlow(mid));
    const endsAt = rest > 0 ? now + rest * 1000 : null;
    if (target) await db.runAsync('UPDATE session_sets SET started_at = ? WHERE id = ?', endsAt ?? now, target.setId);
    if (mid.exercises.find((e) => e.id === ex.id)!.sets.every((s) => s.completed)) await db.runAsync('UPDATE session_exercises SET completed_at = ? WHERE id = ?', now, ex.id);
    await db.runAsync('UPDATE workout_sessions SET rest_ends_at = ?, rest_total_ms = ?, updated_at = ? WHERE id = ?', endsAt, endsAt ? rest * 1000 : null, now, sessionId);
  });
  return rest;
}

export async function undoSet(sessionId: string, setId: string) {
  const db = await getDb();
  await db.runAsync('UPDATE session_sets SET completed = 0, completed_at = NULL, duration_ms = NULL WHERE id = ?', setId);
  await db.runAsync('UPDATE session_exercises SET completed_at = NULL WHERE id = (SELECT session_exercise_id FROM session_sets WHERE id = ?)', setId);
  await db.runAsync('UPDATE workout_sessions SET rest_ends_at = NULL, updated_at = ? WHERE id = ?', Date.now(), sessionId);
}

/** Saltar / terminar o descanso antecipadamente: a série seguinte passa a contar desde agora. */
export async function endRest(sessionId: string) {
  const db = await getDb(); const now = Date.now();
  const s = await getSession(sessionId); if (!s) return;
  const t = currentTarget(s);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE workout_sessions SET rest_ends_at = NULL, updated_at = ? WHERE id = ?', now, sessionId);
    if (t) await db.runAsync('UPDATE session_sets SET started_at = ? WHERE id = ?', now, t.setId);
  });
}
export async function adjustRest(sessionId: string, deltaSeconds: number) {
  const db = await getDb();
  await db.runAsync('UPDATE workout_sessions SET rest_ends_at = MAX(?, rest_ends_at + ?), rest_total_ms = CASE WHEN ? > 0 THEN COALESCE(rest_total_ms, 0) + ? ELSE rest_total_ms END WHERE id = ? AND rest_ends_at IS NOT NULL', Date.now() + 1000, deltaSeconds * 1000, deltaSeconds, deltaSeconds * 1000, sessionId);
}

export async function addExtraSet(sessionExerciseId: string, type: SetType) {
  const db = await getDb();
  const rows = await db.getAllAsync<SetRow>('SELECT * FROM session_sets WHERE session_exercise_id = ? ORDER BY position', sessionExerciseId);
  const se = await db.getFirstAsync<{ weight_increment: number; rest_seconds: number }>('SELECT weight_increment, rest_seconds FROM session_exercises WHERE id = ?', sessionExerciseId);
  const last = rows.at(-1);
  const weight = type === 'drop' && last ? nextDropWeight(last.weight, se?.weight_increment ?? 2.5) : (last?.weight ?? 0);
  const rest = type === 'drop' ? 0 : type === 'rest_pause' ? 20 : (se?.rest_seconds ?? 90);
  await db.runAsync('INSERT INTO session_sets (id, session_exercise_id, position, set_type, target_rep_min, target_rep_max, weight, reps, rest_seconds, is_extra) VALUES (?,?,?,?,?,?,?,?,?,1)',
    uuid(), sessionExerciseId, rows.length, type, last?.target_rep_min ?? 8, last?.target_rep_max ?? 12, weight, last?.reps ?? 8, rest);
}
export async function removeSet(setId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM session_sets WHERE id = ? AND completed = 0', setId);
}

export async function discardSession(sessionId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM workout_sessions WHERE id = ? AND status = \'active\'', sessionId);
}

export { lastPerformance, bestsByExercise, type LastPerformance } from './historyRepo';

export class NoSetsError extends Error {}

export async function finishSession(userId: string, sessionId: string): Promise<SessionSummary> {
  const db = await getDb();
  const s = await getSession(sessionId); if (!s || s.status !== 'active') throw new Error('session_not_active');
  const now = Date.now();
  const doneEx = s.exercises.map((e) => ({ e, done: e.sets.filter((x) => x.completed) })).filter((x) => x.done.length > 0);
  if (doneEx.length === 0) throw new NoSetsError();
  const asLogged = (xs: SessionSet[]): LoggedSet[] => xs.map((x) => ({ weight: x.weight, reps: x.reps, type: x.type }));
  const allDone = doneEx.flatMap((x) => asLogged(x.done));
  const records: SessionSummary['records'] = [];
  for (const { e, done } of doneEx) {
    const hist = await db.getAllAsync<{ weight: number; reps: number; set_type: SetType }>(
      `SELECT ss.weight, ss.reps, ss.set_type FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id JOIN workout_sessions w ON w.id = se.session_id
       WHERE w.user_id = ? AND w.status = 'completed' AND se.exercise_id = ? AND ss.completed = 1 AND w.id != ?`, userId, e.exerciseId, sessionId);
    for (const r of detectPersonalRecords(asLogged(done), hist.map((h) => ({ weight: h.weight, reps: h.reps, type: h.set_type })))) records.push({ exerciseName: e.name, kind: r.kind, value: r.value });
  }
  const prev = await db.getFirstAsync<{ total_volume: number; duration_ms: number; sets: number }>(
    `SELECT w.total_volume, w.duration_ms, (SELECT COUNT(*) FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id WHERE se.session_id = w.id AND ss.completed = 1) AS sets
     FROM workout_sessions w WHERE w.user_id = ? AND w.status = 'completed' AND ((? IS NOT NULL AND w.plan_day_id = ?) OR (? IS NULL AND w.name = ?)) ORDER BY w.completed_at DESC LIMIT 1`,
    userId, s.planDayId, s.planDayId, s.planDayId, s.name);
  const summary: SessionSummary = {
    durationMs: now - s.startedAt, exercisesDone: doneEx.length, setsDone: allDone.length,
    totalReps: allDone.filter((x) => x.type !== 'warmup').reduce((a, x) => a + x.reps, 0), volume: totalVolume(allDone), records,
    previous: prev ? { volume: prev.total_volume ?? 0, durationMs: prev.duration_ms ?? 0, sets: prev.sets } : null,
  };
  await db.withTransactionAsync(async () => {
    // séries não feitas são descartadas: o histórico só contém o que foi realizado
    await db.runAsync('DELETE FROM session_sets WHERE completed = 0 AND session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)', sessionId);
    await db.runAsync('DELETE FROM session_exercises WHERE session_id = ? AND NOT EXISTS (SELECT 1 FROM session_sets WHERE session_exercise_id = session_exercises.id)', sessionId);
    await db.runAsync("UPDATE workout_sessions SET status = 'completed', completed_at = ?, duration_ms = ?, total_volume = ?, rest_ends_at = NULL, summary_json = ?, updated_at = ? WHERE id = ?", now, summary.durationMs, summary.volume, JSON.stringify(summary), now, sessionId);
    for (const r of records) {
      const ex = s.exercises.find((e) => e.name === r.exerciseName)!;
      await db.runAsync('INSERT INTO personal_records (id, user_id, exercise_id, exercise_name, kind, value, session_id, achieved_at) VALUES (?,?,?,?,?,?,?,?)', uuid(), userId, ex.exerciseId, r.exerciseName, r.kind, r.value, sessionId, now);
    }
  });
  const final = await getSession(sessionId);
  await enqueue({ userId, entity: 'workout_session', entityId: sessionId, op: 'upsert', payload: final, coalesce: true });
  return summary;
}

export async function listHistory(userId: string, limit = 30, offset = 0) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; completed_at: number; duration_ms: number; total_volume: number }>(
    "SELECT id, name, completed_at, duration_ms, total_volume FROM workout_sessions WHERE user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT ? OFFSET ?", userId, limit, offset);
  return rows.map((r) => ({ id: r.id, name: r.name, completedAt: r.completed_at, durationMs: r.duration_ms, volume: r.total_volume }));
}

export async function deleteSession(userId: string, sessionId: string) {
  const db = await getDb();
  await db.runAsync("DELETE FROM personal_records WHERE session_id = ?", sessionId);
  await db.runAsync("DELETE FROM workout_sessions WHERE id = ? AND user_id = ? AND status = 'completed'", sessionId, userId);
  await enqueue({ userId, entity: 'workout_session', entityId: sessionId, op: 'delete', payload: { id: sessionId }, coalesce: true });
}

