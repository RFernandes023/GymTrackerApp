import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { freshDb, type TestDb } from './testDb';

let db: TestDb;
vi.mock('../database/db', () => ({ getDb: async () => db }));
vi.mock('../utils/uuid', () => ({ uuid: () => randomUUID() }));

import { searchExercises, createCustomExercise } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import { pendingCount } from '../database/syncQueue';

const A = 'user-a', B = 'user-b';
beforeEach(async () => { db = await freshDb(); });

const find = async (q: string) => (await searchExercises(A, { query: q }))[0]!;

async function benchPlan(weight = 60) {
  const planId = await plans.createPlan(A, 'Upper');
  const dayId = (await plans.getPlan(planId))!.days[0]!.id;
  const bench = await find('Supino plano com barra');
  const row = await find('Remada curvada com barra');
  const p1 = await plans.addExerciseToDay(planId, dayId, bench.id, { weight, sets: 3, repMin: 8, repMax: 12 });
  const p2 = await plans.addExerciseToDay(planId, dayId, row.id, { weight: 50, sets: 2 });
  return { planId, dayId, bench, row, p1, p2 };
}

describe('biblioteca de exercícios', () => {
  it('seed carregado, com nomes PT e filtros', async () => {
    const all = await searchExercises(A, { limit: 1000 });
    expect(all.length).toBeGreaterThan(600);
    expect((await searchExercises(A, { query: 'supino' })).length).toBeGreaterThan(1);
    const chest = await searchExercises(A, { muscle: 'chest', limit: 1000 });
    expect(chest.length).toBeGreaterThan(50);
    expect(chest.every((e) => e.primary.includes('chest'))).toBe(true);
    const bb = await searchExercises(A, { equipment: 'barbell', muscle: 'biceps' });
    expect(bb.every((e) => e.equipment === 'barbell')).toBe(true);
  });
  it('seed é idempotente (não duplica ao reabrir)', async () => {
    const { seedExercises } = await import('../database/exerciseSeed');
    const before = (await searchExercises(A, { limit: 2000 })).length;
    await seedExercises(db as any);
    expect((await searchExercises(A, { limit: 2000 })).length).toBe(before);
  });
  it('exercício personalizado: validação, visível só ao dono', async () => {
    await expect(createCustomExercise(A, { namePt: ' ', primary: ['chest'], equipment: 'other' })).rejects.toThrow('name_required');
    await expect(createCustomExercise(A, { namePt: 'X', primary: [], equipment: 'other' })).rejects.toThrow('muscle_required');
    const ex = await createCustomExercise(A, { namePt: 'Prensa personalizada', primary: ['quads'], equipment: 'machine' });
    expect((await searchExercises(A, { query: 'personalizada' })).map((e) => e.id)).toContain(ex.id);
    expect(await searchExercises(B, { query: 'personalizada' })).toHaveLength(0);
  });
});

describe('planos', () => {
  it('criar, configurar, mover, superset, duplicar, apagar; versão e fila coalescida', async () => {
    const { planId, dayId, p1, p2 } = await benchPlan();
    let plan = (await plans.getPlan(planId))!;
    expect(plan.days[0]!.exercises.map((e) => e.sets.length)).toEqual([3, 2]);
    expect(plan.version).toBeGreaterThan(1);
    await plans.moveExercise(planId, dayId, p2, -1);
    plan = (await plans.getPlan(planId))!;
    expect(plan.days[0]!.exercises[0]!.id).toBe(p2);
    await plans.toggleSupersetWithPrevious(planId, dayId, p1); // p1 está agora em 2.º
    plan = (await plans.getPlan(planId))!;
    expect(plan.days[0]!.exercises.every((e) => e.supersetGroup)).toBe(true);
    await plans.toggleSupersetWithPrevious(planId, dayId, p1);
    expect((await plans.getPlan(planId))!.days[0]!.exercises.every((e) => !e.supersetGroup)).toBe(true);
    // edição regenera séries
    await plans.updateExercise(planId, p1, { ...plans.DEFAULT_CONFIG, weight: 70, sets: 4, dropSets: 1 });
    const e1 = (await plans.getPlan(planId))!.days[0]!.exercises.find((e) => e.id === p1)!;
    expect(e1.sets.map((s) => s.type)).toEqual(['working', 'working', 'working', 'working', 'drop']);
    await expect(plans.updateExercise(planId, p1, { ...plans.DEFAULT_CONFIG, sets: 0 })).rejects.toThrow();
    const copy = await plans.duplicatePlan(planId);
    expect((await plans.getPlan(copy))!.name).toBe('Upper (cópia)');
    expect((await plans.getPlan(copy))!.days[0]!.exercises).toHaveLength(2);
    await plans.deletePlan(copy);
    expect(await plans.getPlan(copy)).toBeNull();
    expect((await plans.listPlans(A)).map((p) => p.id)).toEqual([planId]);
    expect(await plans.listPlans(B)).toHaveLength(0);
    // fila: 1 upsert do plano (coalescido) + delete da cópia + upsert da cópia removido pelo coalesce do delete
    const n = await db.getAllAsync<{ entity_id: string; op: string }>("SELECT entity_id, op FROM sync_queue WHERE entity = 'workout_plan'");
    expect(n.filter((r) => r.entity_id === planId)).toHaveLength(1);
    expect(n.find((r) => r.entity_id === copy)!.op).toBe('delete');
  });
  it('primeiro plano fica ativo', async () => {
    const id = await plans.createPlan(A, 'P1'); const id2 = await plans.createPlan(A, 'P2');
    expect((await plans.getPlan(id))!.isActive).toBe(true);
    await plans.setActivePlan(A, id2);
    expect((await plans.getPlan(id))!.isActive).toBe(false);
    expect((await plans.getPlan(id2))!.isActive).toBe(true);
  });
});

describe('sessão de treino', () => {
  it('fluxo completo: autofill do histórico, descanso, PR e comparação', async () => {
    const { planId, dayId, bench } = await benchPlan(60);

    // sessão 1
    const s1 = await sessions.startSession(A, planId, dayId);
    expect(await sessions.startSession(A, planId, dayId)).toBe(s1); // só uma ativa
    let s = (await sessions.getSession(s1))!;
    const benchEx = s.exercises[0]!;
    expect(benchEx.sets.map((x) => [x.weight, x.reps])).toEqual([[60, 8], [60, 8], [60, 8]]); // valores do plano
    await sessions.updateSet(benchEx.sets[0]!.id, { weight: 60, reps: 12 });
    await expect(sessions.completeSet(s1, benchEx.sets[1]!.id)).resolves.toBe(90); // reps 8 válidas
    await sessions.undoSet(s1, benchEx.sets[1]!.id);
    const rest = await sessions.completeSet(s1, benchEx.sets[0]!.id);
    expect(rest).toBe(90);
    s = (await sessions.getSession(s1))!;
    expect(s.restEndsAt).toBeGreaterThan(Date.now());
    expect(s.restTotalMs).toBe(90_000); // alimenta o anel do descanso
    await sessions.adjustRest(s1, 15);
    expect((await sessions.getSession(s1))!.restTotalMs).toBe(105_000); // +15 s aumenta o total
    await sessions.adjustRest(s1, -15);
    expect((await sessions.getSession(s1))!.restTotalMs).toBe(105_000); // −15 s não reduz o total (o anel só encolhe)
    expect(s.exercises[0]!.sets[0]).toMatchObject({ completed: true });
    expect(s.exercises[0]!.sets[0]!.durationMs).not.toBeNull();
    await sessions.endRest(s1);
    expect((await sessions.getSession(s1))!.restEndsAt).toBeNull();
    // restantes séries
    for (const set of (await sessions.getSession(s1))!.exercises.flatMap((e) => e.sets).filter((x) => !x.completed)) {
      await sessions.updateSet(set.id, { reps: 10 });
      await sessions.completeSet(s1, set.id);
    }
    const sum1 = await sessions.finishSession(A, s1);
    expect(sum1.setsDone).toBe(5);
    expect(sum1.volume).toBe(60 * 12 + 60 * 10 * 2 + 50 * 10 * 2);
    expect(sum1.records).toEqual([]); // 1.ª sessão não tem recordes
    expect(sum1.previous).toBeNull();
    expect(await sessions.getActiveSessionId(A)).toBeNull();

    // sessão 2: autofill com o que fiz na sessão 1
    const last = await sessions.lastPerformance(A, bench.id);
    expect(last!.sets.map((x) => x.reps)).toEqual([12, 10, 10]);
    const s2 = await sessions.startSession(A, planId, dayId);
    const e2 = (await sessions.getSession(s2))!.exercises[0]!;
    expect(e2.sets.map((x) => [x.weight, x.reps])).toEqual([[60, 12], [60, 10], [60, 10]]);
    for (const set of e2.sets) { await sessions.updateSet(set.id, { weight: 62.5, reps: 10 }); await sessions.completeSet(s2, set.id); }
    const sum2 = await sessions.finishSession(A, s2);
    expect(sum2.records.map((r) => r.kind)).toContain('weight');
    expect(sum2.previous).toMatchObject({ volume: sum1.volume });
    // séries não feitas (remada) descartadas do histórico
    expect((await sessions.getSession(s2))!.exercises).toHaveLength(1);
    expect((await sessions.listHistory(A)).map((h) => h.id)).toEqual([s2, s1]);
    expect(await sessions.lastPerformance(B, bench.id)).toBeNull(); // isolamento
    expect(await sessions.listHistory(B)).toHaveLength(0);
    expect(await pendingCount(A)).toBeGreaterThan(0);
  });

  it('não conclui com 0 repetições; terminar sem séries → NoSetsError; descartar', async () => {
    const { planId, dayId } = await benchPlan();
    const id = await sessions.startSession(A, planId, dayId);
    const first = (await sessions.getSession(id))!.exercises[0]!.sets[0]!;
    await sessions.updateSet(first.id, { reps: 0 });
    await expect(sessions.completeSet(id, first.id)).rejects.toThrow('reps_required');
    await expect(sessions.finishSession(A, id)).rejects.toBeInstanceOf(sessions.NoSetsError);
    await sessions.discardSession(id);
    expect(await sessions.getSession(id)).toBeNull();
  });

  it('drop set: sem descanso e carga desce; séries extra; superset alterna', async () => {
    const planId = await plans.createPlan(A, 'D'); const dayId = (await plans.getPlan(planId))!.days[0]!.id;
    const a = await find('Rosca direta com barra'), t = await find('Extensão de tríceps na polia');
    const pa = await plans.addExerciseToDay(planId, dayId, a.id, { weight: 40, sets: 1, dropSets: 1 });
    const pt = await plans.addExerciseToDay(planId, dayId, t.id, { weight: 30, sets: 1 });
    await plans.toggleSupersetWithPrevious(planId, dayId, pt);
    const id = await sessions.startSession(A, planId, dayId);
    let s = (await sessions.getSession(id))!;
    const [exA, exT] = s.exercises as [typeof s.exercises[0], typeof s.exercises[0]];
    // 1.ª série do exercício A (superset) → sem descanso, vai para T
    expect(await sessions.completeSet(id, exA.sets[0]!.id)).toBe(0);
    expect(sessions.currentTarget((await sessions.getSession(id))!)!.exerciseId).toBe(exT.id);
    // drop weight foi reduzido automaticamente
    expect((await sessions.getSession(id))!.exercises[0]!.sets[1]!.weight).toBeLessThan(40);
    // fecha a ronda → descanso normal
    expect(await sessions.completeSet(id, exT.sets[0]!.id)).toBe(90);
    // série extra (rest-pause) com descanso 20
    await sessions.addExtraSet(exT.id, 'rest_pause');
    s = (await sessions.getSession(id))!;
    expect(s.exercises[1]!.sets.at(-1)).toMatchObject({ type: 'rest_pause', isExtra: true, restSeconds: 20 });
    // não se remove série concluída
    await sessions.removeSet(exT.sets[0]!.id);
    expect((await sessions.getSession(id))!.exercises[1]!.sets).toHaveLength(2);
  });

  it('estagnação por histórico de 1RM', async () => {
    const { planId, dayId, bench } = await benchPlan(60);
    const weights = [60, 62.5, 62.5, 60, 60];
    for (const w of weights) {
      const id = await sessions.startSession(A, planId, dayId);
      const e = (await sessions.getSession(id))!.exercises[0]!;
      for (const set of e.sets) { await sessions.updateSet(set.id, { weight: w, reps: 8 }); await sessions.completeSet(id, set.id); }
      await sessions.finishSession(A, id);
    }
    const { isStagnant } = await import('@gym/shared');
    const bests = await sessions.bestsByExercise(A, bench.id);
    expect(bests).toHaveLength(5);
    expect(isStagnant(bests)).toBe(true);
  });
});

import { dashboardStats, muscleWeekStats } from '../features/workouts/statsRepo';

describe('estatísticas', () => {
  it('dashboard e volume semanal por músculo', async () => {
    const empty = await dashboardStats(A);
    expect(empty).toMatchObject({ lastWorkout: null, weekWorkouts: 0, streakWeeks: 0, nextWorkout: null });
    const { planId, dayId, bench } = await benchPlan(60);
    await plans.updateDay(planId, dayId, { dayOfWeek: 2 });
    const before = await dashboardStats(A);
    expect(before.nextWorkout).toMatchObject({ dayId, dayName: 'Treino A' });
    const id = await sessions.startSession(A, planId, dayId);
    for (const e of (await sessions.getSession(id))!.exercises) for (const s of e.sets) await sessions.completeSet(id, s.id);
    await sessions.finishSession(A, id);
    const st = await dashboardStats(A);
    expect(st.lastWorkout!.volume).toBeGreaterThan(0);
    expect(st).toMatchObject({ weekWorkouts: 1, streakWeeks: 1 });
    expect(st.avgDurationMs).not.toBeNull();
    const mw = await muscleWeekStats(A);
    expect(mw.thisWeek.chest).toEqual({ sets: 3, sessions: 1 });
    expect(mw.thisWeek.back!.sets).toBe(2);
    expect(Object.keys(mw.lastWeek)).toHaveLength(0);
    expect((await dashboardStats(B)).weekWorkouts).toBe(0);
    void bench;
  });
});
