import { dropSetWeight, type SetType } from './logic';

export interface FlowSet { id: string; completed: boolean; type: SetType; restSeconds: number }
export interface FlowExercise { id: string; supersetGroup: string | null; sets: FlowSet[] }

const done = (e: FlowExercise) => e.sets.filter((s) => s.completed).length;
const firstPending = (e: FlowExercise) => e.sets.find((s) => !s.completed);

/** Próxima série a fazer. Em superséries alterna entre os exercícios do grupo (o que tem menos séries feitas, empate → primeiro). */
export function nextTarget(exercises: FlowExercise[]): { exerciseId: string; setId: string } | null {
  for (const e of exercises) {
    if (!firstPending(e)) continue;
    let pick = e;
    if (e.supersetGroup) {
      const members = exercises.filter((x) => x.supersetGroup === e.supersetGroup && firstPending(x));
      pick = members.reduce((best, x) => (done(x) < done(best) ? x : best), members[0]!);
    }
    return { exerciseId: pick.id, setId: firstPending(pick)!.id };
  }
  return null;
}

/**
 * Descanso (s) a iniciar depois de concluir `setId`.
 * 0 quando: a série seguinte é drop set (continuação imediata) ou há um parceiro de superset por fazer nesta ronda.
 * Deve ser chamada DEPOIS de marcar a série como concluída.
 */
export function restAfter(exercises: FlowExercise[], exerciseId: string, setId: string): number {
  const ex = exercises.find((e) => e.id === exerciseId)!;
  const idx = ex.sets.findIndex((s) => s.id === setId);
  const set = ex.sets[idx]!;
  const next = ex.sets[idx + 1];
  if (next && !next.completed && next.type === 'drop') return 0;
  if (ex.supersetGroup) {
    const partners = exercises.filter((x) => x.supersetGroup === ex.supersetGroup && x.id !== ex.id && firstPending(x));
    if (partners.some((p) => done(p) < done(ex))) return 0;
  }
  return set.restSeconds;
}

/** Peso sugerido para a drop set que segue `previousWeight`. */
export const nextDropWeight = (previousWeight: number, increment: number) => dropSetWeight(previousWeight, increment);
