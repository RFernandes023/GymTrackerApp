import { isoWeekStart, pickWorkouts, toDateKey, weeklyStreak, type Macros } from '@gym/shared';
import { getDay } from '../nutrition/nutritionRepo';
import type { Goal } from '../nutrition/types';
import { listMeasurements, pointsFor, weeklySummary, type Measurement, type WeeklySummary } from '../progress/measurementsRepo';
import { getDb } from '../../database/db';
import { getPlan, listPlans } from './plansRepo';

export interface DashboardStats {
  /** Análise local (preenchida pelo ecrã do dashboard com `localInsights`). */
  insights?: import('@gym/shared').Insight[];
  lastWorkout: { name: string; completedAt: number; volume: number } | null;
  weekWorkouts: number; weekVolume: number; avgDurationMs: number | null; streakWeeks: number;
  prCount30: number; lastPr: { exerciseName: string; kind: string; value: number } | null;
  nextWorkout: { planName: string; dayId: string; planId: string; dayName: string } | null;
  todayWorkout: { planName: string; dayId: string; planId: string; dayName: string } | null;
  nutrition: { totals: Macros; goal: Goal | null };
  body: {
    weight: { value: number; date: string } | null; bmi: number | null;
    bodyFat: { value: number; source: Measurement['bodyFatSource'] } | null; muscleMass: { value: number; source: Measurement['muscleSource'] } | null;
    waist: { value: number; delta90: number | null } | null; weekly: WeeklySummary;
  };
}

const DAY = 86_400_000;

export async function dashboardStats(userId: string, now = Date.now()): Promise<DashboardStats> {
  const db = await getDb();
  const weekStart = isoWeekStart(now);
  const last = await db.getFirstAsync<{ name: string; completed_at: number; total_volume: number; plan_day_id: string | null }>(
    "SELECT name, completed_at, total_volume, plan_day_id FROM workout_sessions WHERE user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1", userId);
  const week = await db.getFirstAsync<{ n: number; v: number | null }>(
    "SELECT COUNT(*) AS n, SUM(total_volume) AS v FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND completed_at >= ?", userId, weekStart);
  const avg = await db.getFirstAsync<{ a: number | null }>(
    "SELECT AVG(duration_ms) AS a FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND completed_at >= ?", userId, now - 30 * DAY);
  const stamps = await db.getAllAsync<{ completed_at: number }>(
    "SELECT completed_at FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND completed_at >= ?", userId, now - 400 * DAY);
  const pr = await db.getFirstAsync<{ n: number }>('SELECT COUNT(DISTINCT session_id || exercise_id) AS n FROM personal_records WHERE user_id = ? AND achieved_at >= ?', userId, now - 30 * DAY);
  const lastPr = await db.getFirstAsync<{ exercise_name: string; kind: string; value: number }>('SELECT exercise_name, kind, value FROM personal_records WHERE user_id = ? ORDER BY achieved_at DESC LIMIT 1', userId);

  let nextWorkout: DashboardStats['nextWorkout'] = null, todayWorkout: DashboardStats['todayWorkout'] = null;
  const plans = await listPlans(userId);
  const active = plans.find((p) => p.isActive) ?? plans[0];
  if (active) {
    const plan = (await getPlan(active.id))!;
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const doneToday = await db.getAllAsync<{ plan_day_id: string }>("SELECT plan_day_id FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND plan_day_id IS NOT NULL AND completed_at >= ?", userId, midnight.getTime());
    const lastInPlan = await db.getFirstAsync<{ plan_day_id: string }>("SELECT plan_day_id FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND plan_id = ? ORDER BY completed_at DESC LIMIT 1", userId, plan.id);
    const jsDow = new Date(now).getDay();
    const picked = pickWorkouts({ days: plan.days, todayDow: jsDow === 0 ? 7 : jsDow, lastCompletedDayId: lastInPlan?.plan_day_id ?? null, trainedTodayDayIds: doneToday.map((r) => r.plan_day_id) });
    const wrap = (d: { id: string; name: string } | null) => (d ? { planName: plan.name, planId: plan.id, dayId: d.id, dayName: d.name } : null);
    nextWorkout = wrap(picked.next); todayWorkout = wrap(picked.today);
  }
  const day = await getDay(userId, toDateKey(now));
  const ms = await listMeasurements(userId, 500);
  const known = <T,>(pick: (m: Measurement) => T | null) => { for (const m of ms) { const v = pick(m); if (v !== null && v !== undefined) return v; } return null; };
  const waistPts = pointsFor(ms, 'waist');
  const w90 = waistPts.filter((p) => new Date(`${p.date}T12:00:00`).getTime() >= now - 90 * DAY);
  const body: DashboardStats['body'] = {
    weight: known((m) => (m.weight != null ? { value: m.weight, date: m.date } : null)),
    bmi: known((m) => m.bmi),
    bodyFat: known((m) => (m.bodyFat != null ? { value: m.bodyFat, source: m.bodyFatSource } : null)),
    muscleMass: known((m) => (m.muscleMass != null ? { value: m.muscleMass, source: m.muscleSource } : null)),
    waist: waistPts.length ? { value: waistPts.at(-1)!.value, delta90: w90.length >= 2 ? Math.round((w90.at(-1)!.value - w90[0]!.value) * 10) / 10 : null } : null,
    weekly: await weeklySummary(userId, now),
  };
  return {
    body,
    nutrition: { totals: day.totals, goal: day.goal },
    lastWorkout: last ? { name: last.name, completedAt: last.completed_at, volume: last.total_volume } : null,
    weekWorkouts: week?.n ?? 0, weekVolume: week?.v ?? 0, avgDurationMs: avg?.a ?? null, streakWeeks: weeklyStreak(stamps.map((s) => s.completed_at), now),
    prCount30: pr?.n ?? 0, lastPr: lastPr ? { exerciseName: lastPr.exercise_name, kind: lastPr.kind, value: lastPr.value } : null, nextWorkout, todayWorkout,
  };
}

export interface MuscleWeek { sets: number; sessions: number }
/** Séries efetivas e frequência (nº de sessões) por músculo primário: semana atual vs anterior. */
export async function muscleWeekStats(userId: string, now = Date.now()) {
  const db = await getDb();
  const ws = isoWeekStart(now); const prev = new Date(ws); prev.setDate(prev.getDate() - 7); const pws = prev.getTime();
  const rows = await db.getAllAsync<{ sid: string; at: number; pm: string }>(
    `SELECT w.id AS sid, w.completed_at AS at, e.primary_muscles AS pm FROM session_sets ss
     JOIN session_exercises se ON se.id = ss.session_exercise_id JOIN workout_sessions w ON w.id = se.session_id LEFT JOIN exercises e ON e.id = se.exercise_id
     WHERE w.user_id = ? AND w.status = 'completed' AND ss.completed = 1 AND ss.set_type != 'warmup' AND w.completed_at >= ?`, userId, pws);
  const out = { thisWeek: {} as Record<string, MuscleWeek>, lastWeek: {} as Record<string, MuscleWeek> };
  const seen = new Set<string>();
  for (const r of rows) {
    const muscle = (r.pm ? (JSON.parse(r.pm) as string[])[0] : null) ?? 'other';
    const bucket = r.at >= ws ? out.thisWeek : out.lastWeek;
    const m = (bucket[muscle] ??= { sets: 0, sessions: 0 });
    m.sets++;
    const key = `${r.at >= ws ? 't' : 'l'}:${muscle}:${r.sid}`;
    if (!seen.has(key)) { seen.add(key); m.sessions++; }
  }
  return out;
}
