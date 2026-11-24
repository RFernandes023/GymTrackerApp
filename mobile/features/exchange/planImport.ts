import { bestNameMatch, defaultIncrement, GOAL_DEFAULTS, nameSimilarity, normalizeName, type ImportExercise, type ImportPlan, type PlanGoal } from '@gym/shared';
import { getDb } from '../../database/db';
import { createCustomExercise, getExercise, searchExercises } from '../workouts/exercisesRepo';
import { insertFullPlan, type FullPlanSpec } from '../workouts/plansRepo';

export interface Suggestion { id: string; name: string; score: number }
export interface ResolvedImportExercise {
  ex: ImportExercise;
  /** matched = encontrado na biblioteca; new = pode criar-se personalizado (tem músculo); unresolved = sem correspondência nem músculo */
  status: 'matched' | 'new' | 'unresolved';
  exerciseId: string | null; suggestions: Suggestion[];
}
export type Decision = { kind: 'use'; exerciseId: string } | { kind: 'create'; muscle: string; equipment: string } | { kind: 'skip' };

/** Procura na biblioteca (PT/EN) o exercício do JSON e devolve correspondência + sugestões para exercícios desconhecidos. */
export async function resolveImport(userId: string, plan: ImportPlan): Promise<ResolvedImportExercise[][]> {
  const out: ResolvedImportExercise[][] = [];
  for (const d of plan.days) {
    const row: ResolvedImportExercise[] = [];
    for (const ex of d.exercises) {
      const names = [ex.namePt, ex.nameEn].filter((n): n is string => !!n);
      const cands = new Map<string, { id: string; names: string[]; label: string }>();
      for (const n of names) for (const q of [n, ...normalizeName(n).split(' ').filter((t) => t.length > 3)]) for (const c of await searchExercises(userId, { query: q, limit: 25 }))
        cands.set(c.id, { id: c.id, names: [c.namePt ?? '', c.nameEn, c.altName ?? ''], label: c.namePt ?? c.nameEn });
      const list = [...cands.values()];
      const best = names.map((n) => bestNameMatch(n, list)).filter((m): m is { id: string; score: number } => !!m).sort((a, b) => b.score - a.score)[0] ?? null;
      const suggestions = list.map((c) => ({ id: c.id, name: c.label, score: Math.max(...names.flatMap((n) => c.names.map((cn) => (cn ? nameSimilarity(n, cn) : 0)))) }))
        .filter((s) => s.score >= 0.34).sort((a, b) => b.score - a.score).slice(0, 3);
      row.push({ ex, exerciseId: best?.id ?? null, status: best ? 'matched' : ex.primary.length ? 'new' : 'unresolved', suggestions });
    }
    out.push(row);
  }
  return out;
}

export function defaultDecision(r: ResolvedImportExercise): Decision {
  if (r.exerciseId) return { kind: 'use', exerciseId: r.exerciseId };
  if (r.ex.primary[0]) return { kind: 'create', muscle: r.ex.primary[0], equipment: r.ex.equipment ?? 'other' };
  return { kind: 'skip' };
}

export interface ImportResult { planId: string; exercises: number; customCreated: number; skipped: string[] }

/**
 * Cria o plano a partir de um JSON JÁ VALIDADO e das decisões do utilizador. A criação do plano é atómica;
 * se falhar, os exercícios personalizados criados para ele são removidos.
 */
export async function applyImport(userId: string, plan: ImportPlan, decisions: Decision[][], o: { name?: string; goal?: PlanGoal; dayNames?: string[] } = {}): Promise<ImportResult> {
  const goal = o.goal ?? plan.goal; const created: string[] = []; const skipped: string[] = [];
  let exercises = 0;
  try {
    const days: FullPlanSpec['days'] = [];
    for (const [di, d] of plan.days.entries()) {
      const items: FullPlanSpec['days'][number]['exercises'] = [];
      for (const [ei, ex] of d.exercises.entries()) {
        const dec = decisions[di]?.[ei] ?? { kind: 'skip' as const };
        if (dec.kind === 'skip') { skipped.push(ex.displayName); continue; }
        let exerciseId: string;
        if (dec.kind === 'use') { if (!(await getExercise(dec.exerciseId))) throw new Error(`Exercício inexistente: ${ex.displayName}`); exerciseId = dec.exerciseId; }
        else { const c = await createCustomExercise(userId, { namePt: ex.namePt ?? ex.nameEn ?? 'Exercício', nameEn: ex.nameEn ?? undefined, primary: [dec.muscle], secondary: ex.secondary, equipment: dec.equipment, description: 'Criado ao importar um plano.' }); exerciseId = c.id; created.push(c.id); }
        const eq = (await getExercise(exerciseId))!.equipment;
        const work = ex.sets.find((s) => s.type === 'working') ?? ex.sets[0]!;
        items.push({ exerciseId, increment: ex.weightIncrement ?? defaultIncrement(eq), restSeconds: work.restSeconds ?? plan.defaultRestSeconds ?? GOAL_DEFAULTS[ex.goal ?? goal].restSeconds, goal: ex.goal ?? goal, notes: ex.notes, supersetKey: ex.supersetGroup,
          sets: ex.sets.map((s, i) => ({ position: i, type: s.type, repMin: s.repMin, repMax: s.repMax, weight: s.weight, restSeconds: s.restSeconds, rir: s.rir })) });
        exercises++;
      }
      if (items.length) days.push({ name: (o.dayNames?.[di] ?? d.name).trim() || d.name, dayOfWeek: d.dayOfWeek, exercises: items });
    }
    if (days.length === 0) throw new Error('Nenhum exercício para importar (todos foram ignorados).');
    const planId = await insertFullPlan(userId, { name: o.name ?? plan.name, description: plan.description, goal, days });
    return { planId, exercises, customCreated: created.length, skipped };
  } catch (e) {
    const db = await getDb();
    for (const id of created) await db.runAsync('UPDATE exercises SET deleted_at = ? WHERE id = ? AND user_id = ?', Date.now(), id, userId); // desfaz
    throw e;
  }
}
