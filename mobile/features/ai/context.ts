import { addDays, toDateKey, type AiScope } from '@gym/shared';
import { getDb } from '../../database/db';
import { getBodyInfo } from '../profile/profileRepo';
import { getDay } from '../nutrition/nutritionRepo';
import { listMeasurements, pointsFor } from '../progress/measurementsRepo';
import { listPlans, getPlan } from '../workouts/plansRepo';
import { getSession, listHistory } from '../workouts/sessionsRepo';
import { muscleWeekStats } from '../workouts/statsRepo';
import { localInsights } from './insights';

export interface AiContext { scopes: AiScope[]; data: Record<string, unknown> }
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Constrói o contexto a enviar: SÓ o necessário para o pedido e SÓ dos âmbitos escolhidos.
 * Nunca inclui nome, email, ids de conta nem datas de nascimento. Os números (volumes, médias, tendências) são calculados aqui,
 * porque a IA não deve fazer contas.
 */
export async function buildContext(userId: string, scopes: AiScope[], opts: { includeCatalog?: boolean; now?: number } = {}): Promise<AiContext> {
  const now = opts.now ?? Date.now();
  const data: Record<string, unknown> = { today: toDateKey(now), units: 'kg, cm, kcal, g' };

  if (scopes.includes('training')) {
    const plans = await listPlans(userId);
    const active = plans.find((p) => p.isActive) ?? plans[0];
    const plan = active ? await getPlan(active.id) : null;
    const sessions = [];
    for (const h of await listHistory(userId, 6)) {
      const s = await getSession(h.id); if (!s) continue;
      sessions.push({
        date: toDateKey(h.completedAt), name: s.name, durationMin: Math.round(h.durationMs / 60000), volumeKg: Math.round(h.volume),
        exercises: s.exercises.map((e) => {
          const work = e.sets.filter((x) => x.type !== 'warmup' && x.completed);
          const top = work.reduce<typeof work[number] | null>((b, x) => (!b || x.weight * x.reps > b.weight * b.reps ? x : b), null);
          return { name: e.name, sets: work.length, topSet: top ? `${top.weight}kg x ${top.reps}` : null };
        }),
      });
    }
    const mw = await muscleWeekStats(userId, now);
    const sets = (b: Record<string, { sets: number; sessions: number }>) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { sets: v.sets, sessions: v.sessions }]));
    const db = await getDb();
    const pr = await db.getAllAsync<{ exercise_name: string; kind: string; value: number }>('SELECT exercise_name, kind, value FROM personal_records WHERE user_id = ? AND achieved_at >= ? ORDER BY achieved_at DESC LIMIT 8', userId, now - 30 * 86_400_000);
    data.training = {
      activePlan: plan ? { id: plan.id, name: plan.name, goal: plan.goal, days: plan.days.map((d) => ({ name: d.name, dayOfWeek: d.dayOfWeek, exercises: d.exercises.map((e) => {
        const w = e.sets.filter((s) => s.type === 'working' || s.type === 'failure');
        return { name: e.name, sets: w.length, reps: w[0] ? `${w[0].repMin}-${w[0].repMax}` : null, weightKg: w[0]?.weight ?? null, restSeconds: e.restSeconds };
      }) })) } : null,
      recentSessions: sessions,
      weeklySetsPerMuscle: { thisWeek: sets(mw.thisWeek), lastWeek: sets(mw.lastWeek) },
      personalRecordsLast30d: pr.map((p) => ({ exercise: p.exercise_name, kind: p.kind === 'weight' ? 'carga máxima' : '1RM estimado', valueKg: p.value })),
      localAnalysis: (await localInsights(userId, now)).filter((i) => ['stagnation', 'low_volume', 'progression'].includes(i.kind)).map((i) => i.text),
    };
  }

  if (scopes.includes('nutrition')) {
    const today = toDateKey(now); const days: { date: string; kcal: number; protein: number; carbs: number; fat: number }[] = [];
    for (let k = 0; k < 7; k++) { const key = addDays(today, -k); const d = await getDay(userId, key); if (d.entries.length) days.push({ date: key, kcal: Math.round(d.totals.kcal), protein: Math.round(d.totals.protein), carbs: Math.round(d.totals.carbs), fat: Math.round(d.totals.fat) }); }
    const goal = (await getDay(userId, today)).goal;
    const avg = (f: (d: (typeof days)[number]) => number) => (days.length ? Math.round(days.reduce((a, d) => a + f(d), 0) / days.length) : null);
    data.nutrition = { goal: goal ? { kcal: goal.calories, protein: goal.protein, carbs: goal.carbs, fat: goal.fat } : null, daysLoggedOf7: days.length, dailyTotals: days, averages: { kcal: avg((d) => d.kcal), protein: avg((d) => d.protein), carbs: avg((d) => d.carbs), fat: avg((d) => d.fat) } };
  }

  if (scopes.includes('body')) {
    const b = await getBodyInfo(userId); const ms = await listMeasurements(userId, 200);
    const w30 = pointsFor(ms, 'weight').filter((p) => new Date(`${p.date}T12:00:00`).getTime() >= now - 30 * 86_400_000);
    const last = ms[0];
    data.body = {
      sex: b?.sex ?? null, age: b?.age ?? null, heightCm: b?.heightCm ?? null, weightKg: b?.weightKg ?? null,
      weightChange30dKg: w30.length >= 2 ? r1(w30.at(-1)!.value - w30[0]!.value) : null,
      bodyFatPct: last?.bodyFat != null ? { value: last.bodyFat, source: last.bodyFatSource === 'measured' ? 'medido' : 'estimativa' } : null,
      muscleMassKg: last?.muscleMass != null ? { value: last.muscleMass, source: last.muscleSource === 'measured' ? 'medido' : 'estimativa' } : null,
      waistCm: pointsFor(ms, 'waist').at(-1)?.value ?? null,
    };
  }

  if (opts.includeCatalog) {
    const db = await getDb();
    const rows = await db.getAllAsync<{ name_pt: string; name_en: string }>("SELECT name_pt, name_en FROM exercises WHERE deleted_at IS NULL AND name_pt IS NOT NULL AND (user_id IS NULL OR user_id = ?) ORDER BY name_pt LIMIT 120", userId);
    data.catalog = rows.map((r) => `${r.name_pt} / ${r.name_en}`);
  }
  return { scopes, data };
}
