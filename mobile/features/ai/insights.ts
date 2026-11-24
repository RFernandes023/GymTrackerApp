import { isStagnant, lowVolumeInsights, nutritionInsights, progressionInsight, sortInsights, stagnationInsight, suggestDoubleProgression, toDateKey, addDays, type Insight } from '@gym/shared';
import { getDb } from '../../database/db';
import { getDay } from '../nutrition/nutritionRepo';
import { bestsByExercise, lastPerformance } from '../workouts/historyRepo';
import { listHistory, getSession } from '../workouts/sessionsRepo';
import { muscleWeekStats } from '../workouts/statsRepo';

/** Análise 100 % local (sem IA e sem rede): estagnação, progressão, volume por músculo e consistência alimentar. */
export async function localInsights(userId: string, now = Date.now()): Promise<Insight[]> {
  const out: Insight[] = [];
  const db = await getDb();
  const recent = await listHistory(userId, 6);

  // estagnação e progressão dos exercícios feitos recentemente
  const seen = new Set<string>();
  for (const [i, h] of recent.entries()) {
    const s = await getSession(h.id); if (!s) continue;
    for (const e of s.exercises) {
      if (seen.has(e.exerciseId)) continue; seen.add(e.exerciseId);
      if (isStagnant(await bestsByExercise(userId, e.exerciseId, 8))) { out.push(stagnationInsight(e.name)); continue; }
      if (i === 0) {
        const last = await lastPerformance(userId, e.exerciseId);
        const p = last ? suggestDoubleProgression({ lastSets: last.sets, repMin: e.repMin, repMax: e.repMax, increment: e.weightIncrement }) : null;
        if (p?.kind === 'increase_weight') out.push(progressionInsight(e.name, p.message));
      }
    }
  }

  const n14 = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND completed_at >= ?", userId, now - 14 * 86_400_000);
  const mw = await muscleWeekStats(userId, now);
  const sets = (b: Record<string, { sets: number }>) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.sets]));
  out.push(...lowVolumeInsights({ thisWeek: sets(mw.thisWeek), lastWeek: sets(mw.lastWeek), workoutsLast14: n14?.n ?? 0 }));

  // nutrição (últimos 7 dias, só dias com registo)
  const today = toDateKey(now); const days: Awaited<ReturnType<typeof getDay>>[] = [];
  for (let k = 0; k < 7; k++) { const d = await getDay(userId, addDays(today, -k)); if (d.entries.length) days.push(d); }
  const goal = (await getDay(userId, today)).goal;
  if (days.length || goal) {
    const avg = (f: (d: (typeof days)[number]) => number) => (days.length ? days.reduce((a, d) => a + f(d), 0) / days.length : null);
    // sem objetivo nem registos recentes não há nada a dizer
    if (goal || days.length >= 1) out.push(...nutritionInsights({ daysLogged7: days.length, avgProtein: avg((d) => d.totals.protein), goalProtein: goal?.protein ?? null, avgKcal: avg((d) => d.totals.kcal), goalKcal: goal?.calories ?? null }));
  }
  return sortInsights(out).slice(0, 8);
}
