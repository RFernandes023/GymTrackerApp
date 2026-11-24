export type SetType = 'warmup' | 'working' | 'drop' | 'rest_pause' | 'failure';
export const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'Aquecimento', working: 'Efetiva', drop: 'Drop set', rest_pause: 'Rest-pause', failure: 'Até à falha',
};

export interface LoggedSet { weight: number; reps: number; type: SetType }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 62.5 → "62,5" (pt-PT). */
export const formatWeight = (w: number) => String(r2(w)).replace('.', ',');

/** Passo de carga configurável por exercício (0 como mínimo). */
export function stepWeight(current: number, increment: number, dir: -1 | 1): number {
  return Math.max(0, r2(current + dir * increment));
}

/** Séries de aquecimento não contam para o volume. */
export const countsForVolume = (t: SetType) => t !== 'warmup';

export function totalVolume(sets: LoggedSet[]): number {
  return r2(sets.filter((s) => countsForVolume(s.type)).reduce((a, s) => a + s.weight * s.reps, 0));
}

/** Próxima carga de uma drop set: reduz ~pct e arredonda para múltiplo do incremento (nunca acima da anterior). */
export function dropSetWeight(previous: number, increment: number, pct = 0.2): number {
  if (increment <= 0) return r2(previous * (1 - pct));
  const target = previous * (1 - pct);
  return Math.max(0, r2(Math.floor(target / increment) * increment));
}

export const estimate1RM = (weight: number, reps: number) =>
  reps <= 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;

export interface Progression {
  kind: 'increase_weight' | 'increase_reps' | 'hold';
  message: string;
  suggestedWeight: number;
  suggestedReps: number;
}

/** Double progression. É uma SUGESTÃO: nunca deve ser aplicada sem ação explícita do utilizador. */
export function suggestDoubleProgression(a: { lastSets: LoggedSet[]; repMin: number; repMax: number; increment: number }): Progression | null {
  const w = a.lastSets.filter((s) => s.type === 'working' || s.type === 'failure');
  if (w.length === 0) return null;
  const top = Math.max(...w.map((s) => s.weight));
  if (w.every((s) => s.reps >= a.repMax)) {
    const next = r2(top + a.increment);
    return {
      kind: 'increase_weight', suggestedWeight: next, suggestedReps: a.repMin,
      message: `Conseguiste atingir o limite superior de repetições (${a.repMax}) em todas as séries. Recomenda-se experimentar ${formatWeight(next)} kg na próxima sessão.`,
    };
  }
  if (w.every((s) => s.reps >= a.repMin)) {
    return {
      kind: 'increase_reps', suggestedWeight: top, suggestedReps: Math.min(a.repMax, Math.min(...w.map((s) => s.reps)) + 1),
      message: `Estás dentro do intervalo. Mantém ${formatWeight(top)} kg e tenta somar uma repetição por série até chegares a ${a.repMax}.`,
    };
  }
  return {
    kind: 'hold', suggestedWeight: top, suggestedReps: a.repMin,
    message: `Alguma série ficou abaixo do mínimo (${a.repMin}). Mantém ${formatWeight(top)} kg e procura atingir o mínimo em todas as séries.`,
  };
}

/** Estagnação: nenhuma das últimas `window` sessões superou o melhor 1RM estimado anterior. `bests` ordenado do mais antigo ao mais recente. */
export function isStagnant(bests: number[], window = 3): boolean {
  if (bests.length < window + 1) return false;
  const prior = Math.max(...bests.slice(0, -window));
  const recent = Math.max(...bests.slice(-window));
  return recent <= prior;
}

export interface PersonalRecord { kind: 'weight' | 'e1rm'; value: number }

/** Só há recorde se existir histórico anterior (a 1.ª sessão não é "recorde"). */
export function detectPersonalRecords(current: LoggedSet[], history: LoggedSet[]): PersonalRecord[] {
  const cur = current.filter((s) => s.type !== 'warmup' && s.reps > 0);
  const old = history.filter((s) => s.type !== 'warmup' && s.reps > 0);
  if (cur.length === 0 || old.length === 0) return [];
  const out: PersonalRecord[] = [];
  const cw = Math.max(...cur.map((s) => s.weight)), ow = Math.max(...old.map((s) => s.weight));
  if (cw > ow) out.push({ kind: 'weight', value: cw });
  const ce = Math.max(...cur.map((s) => estimate1RM(s.weight, s.reps))), oe = Math.max(...old.map((s) => estimate1RM(s.weight, s.reps)));
  if (ce > oe) out.push({ kind: 'e1rm', value: ce });
  return out;
}

/** Segunda-feira 00:00 (hora local) da semana de `ts`. */
export function isoWeekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
const prevWeek = (ws: number) => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d.getTime(); };

/** Semanas consecutivas com ≥1 treino. Se a semana atual ainda não tem treino, a sequência conta a partir da anterior. */
export function weeklyStreak(workoutTimestamps: number[], now: number): number {
  const weeks = new Set(workoutTimestamps.map(isoWeekStart));
  let w = isoWeekStart(now);
  if (!weeks.has(w)) w = prevWeek(w);
  let n = 0;
  while (weeks.has(w)) { n++; w = prevWeek(w); }
  return n;
}

export interface MuscleSet { muscle: string; type: SetType }
/** Nº de séries efetivas por grupo muscular (métrica padrão de volume semanal). */
export function setsPerMuscle(sets: MuscleSet[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sets) if (countsForVolume(s.type)) out[s.muscle] = (out[s.muscle] ?? 0) + 1;
  return out;
}
