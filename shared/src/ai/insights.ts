export interface Insight { id: string; kind: 'stagnation' | 'low_volume' | 'progression' | 'nutrition' | 'consistency'; text: string; priority: number }

export const MAJOR_MUSCLES = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps'] as const;
const LABEL: Record<string, string> = { chest: 'peito', back: 'costas', shoulders: 'ombros', quads: 'quadríceps', hamstrings: 'isquiotibiais', glutes: 'glúteos', biceps: 'bíceps', triceps: 'tríceps' };
export const LOW_VOLUME_SETS_PER_WEEK = 6; // abaixo disto o estímulo é claramente baixo (a literatura sugere ~10–20 para hipertrofia)

/** Músculos principais com poucas séries semanais (média das duas últimas semanas). Só se treinaste ≥3 vezes nesse período. */
export function lowVolumeInsights(a: { thisWeek: Record<string, number>; lastWeek: Record<string, number>; workoutsLast14: number }): Insight[] {
  if (a.workoutsLast14 < 3) return [];
  const out: Insight[] = [];
  for (const m of MAJOR_MUSCLES) {
    const avg = ((a.thisWeek[m] ?? 0) + (a.lastWeek[m] ?? 0)) / 2;
    if (avg < LOW_VOLUME_SETS_PER_WEEK) out.push({ id: `low:${m}`, kind: 'low_volume', priority: 2, text: `Pouco volume de ${LABEL[m]}: cerca de ${Math.round(avg * 10) / 10} séries/semana nas últimas 2 semanas.` });
  }
  return out;
}

export function nutritionInsights(a: { daysLogged7: number; avgProtein: number | null; goalProtein: number | null; avgKcal: number | null; goalKcal: number | null }): Insight[] {
  const out: Insight[] = [];
  if (a.daysLogged7 < 4) out.push({ id: 'cons', kind: 'consistency', priority: 3, text: `Registaste a alimentação em ${a.daysLogged7} de 7 dias. Com mais dias registados as médias ficam mais fiáveis.` });
  else {
    if (a.goalProtein && a.avgProtein !== null && a.avgProtein < a.goalProtein * 0.8) out.push({ id: 'prot', kind: 'nutrition', priority: 2, text: `Proteína média de ${Math.round(a.avgProtein)} g/dia, abaixo do objetivo de ${Math.round(a.goalProtein)} g.` });
    if (a.goalKcal && a.avgKcal !== null && Math.abs(a.avgKcal - a.goalKcal) / a.goalKcal > 0.15) out.push({ id: 'kcal', kind: 'nutrition', priority: 3, text: `Calorias médias de ${Math.round(a.avgKcal)} kcal/dia vs. objetivo de ${Math.round(a.goalKcal)} kcal (diferença superior a 15 %).` });
  }
  return out;
}

export const stagnationInsight = (name: string): Insight => ({ id: `stag:${name}`, kind: 'stagnation', priority: 1, text: `Sem progresso nas últimas 3 sessões em ${name}. Considera variar a carga, as repetições ou o descanso.` });
export const progressionInsight = (name: string, message: string): Insight => ({ id: `prog:${name}`, kind: 'progression', priority: 1, text: `${name}: ${message}` });
export const sortInsights = (xs: Insight[]) => [...xs].sort((a, b) => a.priority - b.priority);
