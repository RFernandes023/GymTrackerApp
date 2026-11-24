import { dropSetWeight, type SetType } from './logic';

export interface ExerciseConfig {
  warmups: number; sets: number; repMin: number; repMax: number; weight: number; increment: number; restSeconds: number;
  rir: number | null; dropSets: number; restPauseSets: number; lastSetToFailure: boolean; notes: string; goal: string;
}
export const DEFAULT_CONFIG: ExerciseConfig = {
  warmups: 0, sets: 3, repMin: 8, repMax: 12, weight: 0, increment: 2.5, restSeconds: 90, rir: null,
  dropSets: 0, restPauseSets: 0, lastSetToFailure: false, notes: '', goal: 'hypertrophy',
};

export interface PlanSetDraft { position: number; type: SetType; repMin: number; repMax: number; weight: number; restSeconds: number | null; rir: number | null }
type SetDraft = PlanSetDraft;

/** Converte a configuração (nº de séries, tipos…) na lista concreta de séries do plano. */
export function buildSets(c: ExerciseConfig): SetDraft[] {
  const out: SetDraft[] = [];
  const step = c.increment > 0 ? c.increment : 2.5;
  const warm = c.weight > 0 ? Math.max(0, Math.round((c.weight * 0.5) / step) * step) : 0;
  for (let i = 0; i < c.warmups; i++) out.push({ position: 0, type: 'warmup', repMin: 12, repMax: 15, weight: warm, restSeconds: 60, rir: null });
  for (let i = 0; i < c.sets; i++) {
    const last = i === c.sets - 1;
    out.push({ position: 0, type: last && c.lastSetToFailure ? 'failure' : 'working', repMin: c.repMin, repMax: c.repMax, weight: c.weight, restSeconds: c.restSeconds, rir: c.rir });
  }
  let w = c.weight;
  for (let i = 0; i < c.dropSets; i++) { w = dropSetWeight(w, step); out.push({ position: 0, type: 'drop', repMin: c.repMin, repMax: c.repMax, weight: w, restSeconds: i === c.dropSets - 1 ? c.restSeconds : 0, rir: null }); }
  for (let i = 0; i < c.restPauseSets; i++) out.push({ position: 0, type: 'rest_pause', repMin: 3, repMax: 6, weight: c.weight, restSeconds: i === c.restPauseSets - 1 ? c.restSeconds : 20, rir: null });
  return out.map((s, i) => ({ ...s, position: i }));
}

export interface InferablePlanExercise { weightIncrement: number; restSeconds: number; notes: string | null; goal: string | null; sets: PlanSetDraft[] }
export function inferConfig(pe: InferablePlanExercise): ExerciseConfig {
  const w = pe.sets.filter((s) => s.type === 'working' || s.type === 'failure');
  const first = w[0] ?? pe.sets[0];
  return {
    warmups: pe.sets.filter((s) => s.type === 'warmup').length, sets: w.length, repMin: first?.repMin ?? 8, repMax: first?.repMax ?? 12,
    weight: first?.weight ?? 0, increment: pe.weightIncrement, restSeconds: pe.restSeconds, rir: first?.rir ?? null,
    dropSets: pe.sets.filter((s) => s.type === 'drop').length, restPauseSets: pe.sets.filter((s) => s.type === 'rest_pause').length,
    lastSetToFailure: w.at(-1)?.type === 'failure', notes: pe.notes ?? '', goal: pe.goal ?? 'hypertrophy',
  };
}

export function validateConfig(c: ExerciseConfig): string | null {
  if (!Number.isInteger(c.sets) || c.sets < 1 || c.sets > 20) return 'O número de séries deve estar entre 1 e 20.';
  if (c.repMin < 1 || c.repMax < c.repMin || c.repMax > 100) return 'Intervalo de repetições inválido.';
  if (c.weight < 0 || c.increment <= 0) return 'Peso e incremento devem ser positivos.';
  if (c.restSeconds < 0 || c.restSeconds > 1800) return 'Descanso inválido (0–1800 s).';
  return null;
}

