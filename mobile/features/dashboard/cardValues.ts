import { formatDuration } from '@gym/shared';
import type { DashboardStats } from '../workouts/statsRepo';
import { fmtDate, fmtKg, fmtMinutes, fmtNumber } from '../../utils/format';

export interface CardValue { value: string; sub?: string; route?: string }

/** Valor real de um cartão a partir das estatísticas; `null` = ainda sem dados (a UI mostra estado vazio). */
export function cardValue(type: string, s: DashboardStats): CardValue | null {
  switch (type) {
    case 'next_workout': return s.nextWorkout ? { value: s.nextWorkout.dayName, sub: s.nextWorkout.planName, route: '/workout' } : null;
    case 'today_workout': return s.todayWorkout ? { value: s.todayWorkout.dayName, sub: s.todayWorkout.planName, route: '/workout' } : null;
    case 'last_workout': return s.lastWorkout ? { value: s.lastWorkout.name, sub: `${fmtDate(s.lastWorkout.completedAt)} · ${fmtKg(s.lastWorkout.volume)}` } : null;
    case 'week_workouts': return { value: String(s.weekWorkouts), sub: s.weekWorkouts === 1 ? 'treino esta semana' : 'treinos esta semana' };
    case 'avg_duration': return s.avgDurationMs ? { value: fmtMinutes(s.avgDurationMs), sub: 'média dos últimos 30 dias' } : null;
    case 'week_volume': return s.weekVolume > 0 ? { value: fmtKg(s.weekVolume), sub: 'esta semana' } : null;
    case 'streak': return s.streakWeeks > 0 ? { value: `${s.streakWeeks} sem.`, sub: 'semanas seguidas com treino' } : null;
    case 'personal_records': return s.prCount30 > 0 && s.lastPr ? { value: String(s.prCount30), sub: `últimos 30 dias · mais recente: ${s.lastPr.exerciseName}` } : null;
    case 'kcal_consumed': { const { totals: t, goal: g } = s.nutrition; return t.kcal > 0 || g ? { value: `${fmtNumber(Math.round(t.kcal))} kcal`, sub: g ? `de ${fmtNumber(g.calories)} kcal`  : 'hoje', route: '/nutrition' } : null; }
    case 'kcal_goal': return s.nutrition.goal ? { value: `${fmtNumber(s.nutrition.goal.calories)} kcal`, sub: 'objetivo diário' } : null;
    case 'kcal_remaining': { const { totals: t, goal: g } = s.nutrition; if (!g) return null; const r = Math.round(g.calories - t.kcal); return { value: `${fmtNumber(Math.abs(r))} kcal`, sub: r >= 0 ? 'restantes hoje' : 'acima do objetivo' }; }
    case 'macro_protein': return macro(s, 'protein', 'Proteínas');
    case 'macro_carbs': return macro(s, 'carbs', 'Hidratos');
    case 'macro_fat': return macro(s, 'fat', 'Gorduras');
    case 'daily_progress': { const { totals: t, goal: g } = s.nutrition; return g ? { value: `${Math.round((t.kcal / g.calories) * 100)} %`, sub: 'do objetivo calórico' } : null; }
    case 'weight_current': return s.body.weight ? { value: fmtKg(s.body.weight.value), sub: fmtDate(new Date(`${s.body.weight.date}T12:00:00`).getTime()) } : null;
    case 'bmi': return s.body.bmi != null ? { value: fmtNumber(s.body.bmi), sub: bmiCategory(s.body.bmi) } : null;
    case 'body_fat': return s.body.bodyFat ? { value: `${fmtNumber(s.body.bodyFat.value)} %`, sub: s.body.bodyFat.source === 'measured' ? 'medido' : 'estimativa' } : null;
    case 'muscle_mass': return s.body.muscleMass ? { value: fmtKg(s.body.muscleMass.value), sub: s.body.muscleMass.source === 'measured' ? 'medido' : 'estimativa' } : null;
    case 'waist_trend': return s.body.waist ? { value: `${fmtNumber(s.body.waist.value)} cm`, sub: s.body.waist.delta90 === null ? 'último registo' : `${s.body.waist.delta90 >= 0 ? '+' : '−'}${fmtNumber(Math.abs(s.body.waist.delta90))} cm em 90 dias` } : null;
    case 'weekly_summary': {
      const w = s.body.weekly;
      if (w.workouts === 0 && w.kcalAvg === null && w.weightDelta === null) return null;
      return { value: `${w.workouts} treino${w.workouts === 1 ? '' : 's'}`, sub: [w.volume > 0 ? fmtKg(w.volume) : null, w.kcalAvg !== null ? `${fmtNumber(w.kcalAvg)} kcal/dia` : null, w.weightDelta !== null ? `${w.weightDelta >= 0 ? '+' : '−'}${fmtNumber(Math.abs(w.weightDelta))} kg` : null].filter(Boolean).join(' · ') };
    }
    case 'ai_suggestions': {
      const ins = s.insights ?? [];
      if (!ins.length) return null;
      return { value: INSIGHT_LABEL[ins[0]!.kind] ?? 'Sugestão', sub: ins[0]!.text + (ins.length > 1 ? ` (+${ins.length - 1})` : ''), route: '/coach' };
    }
    default: return null;
  }
}

function macro(s: DashboardStats, k: 'protein' | 'carbs' | 'fat', label: string): CardValue | null {
  const v = s.nutrition.totals[k], g = s.nutrition.goal?.[k];
  return v > 0 || g ? { value: `${fmtNumber(Math.round(v))} g`, sub: g ? `${label} · de ${fmtNumber(Math.round(g))} g` : `${label} hoje` } : null;
}
/** Categorias de IMC da OMS (referência geral para adultos; não é diagnóstico). */
export const bmiCategory = (b: number) => (b < 18.5 ? 'abaixo do peso' : b < 25 ? 'peso normal' : b < 30 ? 'excesso de peso' : 'obesidade');
const INSIGHT_LABEL: Record<string, string> = { stagnation: 'Estagnação', low_volume: 'Pouco volume', progression: 'Podes progredir', nutrition: 'Nutrição', consistency: 'Consistência' };
export const PHASE_DONE = 5;
export { formatDuration };
