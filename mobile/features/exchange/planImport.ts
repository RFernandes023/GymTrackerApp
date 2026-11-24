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

/** Exercício da biblioteca ou personalizado deste utilizador (nunca apagado nem de outra conta). */
async function availableExercise(userId: string, id: string) {
  const db = await getDb();
  return db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ? AND deleted_at IS NULL AND (user_id IS NULL OR user_id = ?)', id, userId);
}

/** Texto para dar a uma IA: formato + lista de exercícios da app (incluindo os personalizados) para ela só usar os que existem. */
export async function aiPlanInstructions(userId: string): Promise<string> {
  const all = await searchExercises(userId, { limit: 5000 });
  const example = { schemaVersion: '1.0', type: 'workout_plan', name: 'Nome do plano', settings: { goal: 'hypertrophy', restBetweenExercises: 120 },
    days: [{ name: 'Dia A', dayOfWeek: null, exercises: [{ exerciseId: all[0]?.id ?? 'ID', name: all[0] ? all[0].namePt ?? all[0].nameEn : 'Nome', sets: [{ type: 'working', reps: { min: 8, max: 12 }, restSeconds: 120 }] }] }] };
  return [
    'Cria um plano de treino em JSON para eu importar na minha app. Responde APENAS com o JSON, sem texto à volta.',
    'Regras: usa só exercícios da LISTA, com o "exerciseId" exato. 1 a 7 dias, 1 a 15 exercícios por dia, 1 a 15 séries por exercício.',
    'goal: hypertrophy | strength | endurance. dayOfWeek: 1 (segunda) a 7 (domingo) ou null. type da série: warmup | working | drop | rest_pause | failure.',
    'reps: inteiro ou {"min","max"}. weight em kg (omite se não souberes). Opcionais por exercício: weightIncrement, notes, supersetGroup (mesmo texto = superset).',
    '', 'EXEMPLO:', JSON.stringify(example, null, 1), '', 'LISTA (exerciseId | nome | músculo | equipamento):',
    ...all.map((e) => `${e.id} | ${e.namePt ?? e.nameEn} | ${e.primary.join(',')} | ${e.equipment}`),
    '', 'O MEU PEDIDO: (escreve aqui o objetivo, quantos dias por semana e o equipamento que tens)',
  ].join('\n');
}

/** Procura na biblioteca (PT/EN) o exercício do JSON e devolve correspondência + sugestões para exercícios desconhecidos. */
export async function resolveImport(userId: string, plan: ImportPlan): Promise<ResolvedImportExercise[][]> {
  const out: ResolvedImportExercise[][] = [];
  for (const d of plan.days) {
    const row: ResolvedImportExercise[] = [];
    for (const ex of d.exercises) {
      // o ID da biblioteca é exato: não é preciso adivinhar pelo nome
      const byId = ex.exerciseId ? await availableExercise(userId, ex.exerciseId) : null;
      if (byId) { row.push({ ex, exerciseId: byId.id, status: 'matched', suggestions: [] }); continue; }
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
