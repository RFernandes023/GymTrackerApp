import { bestNameMatch, diffPlan, normalizeName, type DiffDay, type DiffItem, type PlanProposal } from '@gym/shared';
import { createCustomExercise, searchExercises } from '../workouts/exercisesRepo';
import { addDay, addExerciseToDay, createPlan, getPlan, listPlans, removeExercise, toggleSupersetWithPrevious, updateDay } from '../workouts/plansRepo';
import { exerciseName } from '../workouts/types';

export interface ResolvedExercise {
  exerciseId: string | null; name: string; sets: number; repMin: number; repMax: number; weight: number | null; restSeconds: number | null;
  muscle?: string; equipment?: string; notes?: string; supersetWithPrevious?: boolean;
  /** matched = existe na biblioteca; will_create = será criado como personalizado; ignored = sem correspondência nem músculo → não é aplicado */
  status: 'matched' | 'will_create' | 'ignored';
}
export interface ResolvedProposal { planName: string; goal: PlanProposal['goal']; rationale: string; targetPlanId: string | null; days: { name: string; dayOfWeek: number | null; exercises: ResolvedExercise[] }[] }

/** Casa cada exercício proposto com a biblioteca (PT/EN). Só aceita como `targetPlanId` planos do próprio utilizador. */
export async function resolveProposal(userId: string, p: PlanProposal): Promise<ResolvedProposal> {
  const mine = new Set((await listPlans(userId)).map((x) => x.id));
  const days: ResolvedProposal['days'] = [];
  for (const d of p.days) {
    const exercises: ResolvedExercise[] = [];
    for (const e of d.exercises) {
      const cands = new Map<string, { id: string; names: string[] }>();
      const queries = [e.name, ...normalizeName(e.name).split(' ').filter((t) => t.length > 3)];
      for (const q of queries) for (const c of await searchExercises(userId, { query: q, limit: 25 })) cands.set(c.id, { id: c.id, names: [c.namePt ?? '', c.nameEn, c.altName ?? ''] });
      const m = bestNameMatch(e.name, [...cands.values()]);
      exercises.push({
        exerciseId: m?.id ?? null, name: e.name, sets: e.sets, repMin: e.repMin, repMax: e.repMax, weight: e.weight ?? null, restSeconds: e.restSeconds ?? null,
        muscle: e.muscle, equipment: e.equipment, notes: e.notes, supersetWithPrevious: e.supersetWithPrevious, status: m ? 'matched' : e.muscle ? 'will_create' : 'ignored',
      });
    }
    days.push({ name: d.name, dayOfWeek: d.dayOfWeek ?? null, exercises });
  }
  return { planName: p.planName, goal: p.goal, rationale: p.rationale, targetPlanId: p.targetPlanId && mine.has(p.targetPlanId) ? p.targetPlanId : null, days };
}

/** O que a proposta mudaria (sem aplicar nada). */
export async function buildProposalDiff(userId: string, rp: ResolvedProposal): Promise<{ items: DiffItem[]; targetPlanName: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const target = rp.targetPlanId ? await getPlan(rp.targetPlanId) : null;
  const current = target ? { days: target.days.map((d): DiffDay => ({ name: d.name, exercises: d.exercises.map((e) => {
    const w = e.sets.filter((s) => s.type === 'working' || s.type === 'failure');
    return { exerciseId: e.exerciseId, name: e.name, sets: w.length, repMin: w[0]?.repMin ?? 0, repMax: w[0]?.repMax ?? 0, weight: w[0]?.weight ?? null, restSeconds: e.restSeconds };
  }) })) } : null;
  const proposed = { days: rp.days.map((d): DiffDay => ({ name: d.name, exercises: d.exercises.filter((e) => e.status !== 'ignored').map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, repMin: e.repMin, repMax: e.repMax, weight: e.weight, restSeconds: e.restSeconds })) })) };
  for (const d of rp.days) for (const e of d.exercises) {
    if (e.status === 'will_create') warnings.push(`“${e.name}” não existe na biblioteca: será criado como exercício personalizado.`);
    if (e.status === 'ignored') warnings.push(`“${e.name}” não foi encontrado e não tem músculo indicado: será ignorado.`);
  }
  return { items: diffPlan(current, proposed), targetPlanName: target?.name ?? null, warnings };
}

export interface ApplyResult { planId: string; added: number; createdCustom: number; ignored: string[] }

/**
 * Aplica a proposta. SÓ deve ser chamada depois de o utilizador aceitar.
 * Num plano existente reconstrói apenas os dias mencionados (nunca apaga dias nem outros planos).
 */
export async function applyProposal(userId: string, rp: ResolvedProposal): Promise<ApplyResult> {
  const result: ApplyResult = { planId: '', added: 0, createdCustom: 0, ignored: [] };
  let planId = rp.targetPlanId; let firstDayReused = false;
  if (planId && !(await listPlans(userId)).some((p) => p.id === planId)) planId = null; // defesa: nunca tocar em planos alheios
  const isNew = !planId;
  if (!planId) planId = await createPlan(userId, rp.planName, rp.rationale || undefined, rp.goal);
  result.planId = planId;

  for (const d of rp.days) {
    let plan = (await getPlan(planId))!;
    let day = plan.days.find((x) => normalizeName(x.name) === normalizeName(d.name));
    if (!day && isNew && !firstDayReused) { day = plan.days[0]!; firstDayReused = true; await updateDay(planId, day.id, { name: d.name }); }
    if (!day) { await addDay(planId, d.name); plan = (await getPlan(planId))!; day = plan.days.find((x) => normalizeName(x.name) === normalizeName(d.name)) ?? plan.days.at(-1)!; }
    if (d.dayOfWeek !== null) await updateDay(planId, day.id, { dayOfWeek: d.dayOfWeek });
    for (const e of day.exercises) await removeExercise(planId, e.id);
    let prevAdded = false;
    for (const e of d.exercises) {
      if (e.status === 'ignored') { result.ignored.push(e.name); continue; }
      let exerciseId = e.exerciseId;
      if (!exerciseId) { exerciseId = (await createCustomExercise(userId, { namePt: e.name, primary: [e.muscle!], equipment: e.equipment ?? 'other', description: 'Criado a partir de uma sugestão do Treinador IA.' })).id; result.createdCustom++; }
      const peId = await addExerciseToDay(planId, day.id, exerciseId, {
        sets: e.sets, repMin: e.repMin, repMax: e.repMax, notes: e.notes ?? '',
        ...(e.weight != null ? { weight: e.weight } : {}), ...(e.restSeconds != null ? { restSeconds: e.restSeconds } : {}),
      });
      result.added++;
      if (e.supersetWithPrevious && prevAdded) await toggleSupersetWithPrevious(planId, day.id, peId);
      prevAdded = true;
    }
  }
  return result;
}
export { exerciseName };
