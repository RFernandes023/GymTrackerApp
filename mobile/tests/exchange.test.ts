import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { freshDb, type TestDb } from './testDb';

let db: TestDb;
vi.mock('../database/db', () => ({ getDb: async () => db }));
vi.mock('../utils/uuid', () => ({ uuid: () => randomUUID() }));

import { parsePlanJson, type ImportPlan } from '@gym/shared';
import { searchExercises } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import * as foods from '../features/nutrition/foodsRepo';
import * as nut from '../features/nutrition/nutritionRepo';
import { applyImport, defaultDecision, resolveImport, type Decision } from '../features/exchange/planImport';
import { exportAllPlans, exportByKind, exportCustomExercises, exportHistory, exportNutrition, exportPlan } from '../features/exchange/exporters';
import { createCustomExercise } from '../features/workouts/exercisesRepo';

const A = 'user-a', B = 'user-b';
beforeEach(async () => { db = await freshDb(); });

const BRIEF = {
  schemaVersion: '1.0', type: 'workout_plan', name: 'Upper Body', description: 'Plano de hipertrofia', language: 'pt-PT', settings: { goal: 'hypertrophy', restBetweenExercises: 120 },
  days: [{ name: 'Upper A', dayOfWeek: 1, exercises: [
    { name: { pt: 'Supino plano com barra', en: 'Barbell Bench Press' }, muscleGroups: { primary: ['chest'], secondary: ['triceps', 'front_delts'] }, equipment: 'barbell',
      sets: [{ type: 'warmup', reps: { min: 12, max: 15 }, weight: 20, restSeconds: 60 }, { type: 'working', reps: { min: 8, max: 12 }, weight: 60, restSeconds: 120, rir: null }, { type: 'working', reps: { min: 8, max: 12 }, weight: 60, restSeconds: 120, rir: null }, { type: 'working', reps: { min: 8, max: 12 }, weight: 60, restSeconds: 120, rir: null }],
      weightIncrement: 2.5, goal: 'hypertrophy', notes: 'Controlar a descida' }] }],
};
const parsed = (o: unknown): ImportPlan => { const r = parsePlanJson(JSON.stringify(o)); if (!r.ok) throw new Error(r.errors.join(';')); return r.plan; };
const importAuto = async (plan: ImportPlan, userId = A) => {
  const res = await resolveImport(userId, plan);
  return applyImport(userId, plan, res.map((row) => row.map(defaultDecision)));
};

describe('importar', () => {
  it('exemplo do brief: séries exatas (aquecimento + 3 efetivas), descanso, notas e plano criado', async () => {
    const r = await importAuto(parsed(BRIEF));
    expect(r).toMatchObject({ exercises: 1, customCreated: 0, skipped: [] });
    const p = (await plans.getPlan(r.planId))!;
    expect(p).toMatchObject({ name: 'Upper Body', goal: 'hypertrophy' });
    expect(p.days[0]).toMatchObject({ name: 'Upper A', dayOfWeek: 1 });
    const e = p.days[0]!.exercises[0]!;
    expect(e.name).toBe('Supino plano com barra'); expect(e.weightIncrement).toBe(2.5); expect(e.notes).toBe('Controlar a descida');
    expect(e.sets.map((s) => [s.type, s.repMin, s.repMax, s.weight, s.restSeconds])).toEqual([['warmup', 12, 15, 20, 60], ['working', 8, 12, 60, 120], ['working', 8, 12, 60, 120], ['working', 8, 12, 60, 120]]);
  });
  it('treino iniciado a partir do plano importado usa as cargas importadas', async () => {
    const r = await importAuto(parsed(BRIEF));
    const sid = await sessions.startSession(A, r.planId, (await plans.getPlan(r.planId))!.days[0]!.id);
    expect((await sessions.getSession(sid))!.exercises[0]!.sets.map((s) => s.weight)).toEqual([20, 60, 60, 60]);
  });
  it('exercício desconhecido: cria personalizado (com músculo) ou ignora (sem músculo); nome em PT', async () => {
    const o = JSON.parse(JSON.stringify(BRIEF));
    o.days[0].exercises.push({ name: { pt: 'Máquina Inventada Zzz' }, muscleGroups: { primary: ['back'] }, equipment: 'machine', sets: [{ reps: 10, weight: 30 }] });
    o.days[0].exercises.push({ name: 'Coisa Sem Músculo Qwerty', sets: [{ reps: 10 }] });
    const plan = parsed(o); const res = await resolveImport(A, plan);
    expect(res[0]!.map((x) => x.status)).toEqual(['matched', 'new', 'unresolved']);
    const r = await applyImport(A, plan, res.map((row) => row.map(defaultDecision)));
    expect(r).toMatchObject({ exercises: 2, customCreated: 1, skipped: ['Coisa Sem Músculo Qwerty'] });
    expect((await searchExercises(A, { query: 'Máquina Inventada' }))[0]).toMatchObject({ isCustom: true, primary: ['back'], equipment: 'machine' });
    expect(await searchExercises(B, { query: 'Máquina Inventada' })).toHaveLength(0);
  });
  it('decisões do utilizador: usar sugestão, criar com outro músculo, ignorar', async () => {
    const o = JSON.parse(JSON.stringify(BRIEF)); o.days[0].exercises = [{ name: 'Supino com barra deitado', sets: [{ reps: 8, weight: 40 }] }, { name: 'Outra Qualquer Wxyz', sets: [{ reps: 8 }] }];
    const plan = parsed(o); const res = await resolveImport(A, plan);
    expect(res[0]![0]!.suggestions.length).toBeGreaterThan(0); // sugere supinos
    const pick = res[0]![0]!.suggestions[0]!;
    const dec: Decision[][] = [[{ kind: 'use', exerciseId: pick.id }, { kind: 'create', muscle: 'abs', equipment: 'other' }]];
    const r = await applyImport(A, plan, dec, { name: 'Renomeado', goal: 'strength', dayNames: ['Dia X'] });
    const p = (await plans.getPlan(r.planId))!;
    expect(p).toMatchObject({ name: 'Renomeado', goal: 'strength' }); expect(p.days[0]!.name).toBe('Dia X'); expect(p.days[0]!.exercises).toHaveLength(2);
    const skipAll = await applyImport(A, plan, [[{ kind: 'skip' }, { kind: 'skip' }]]).catch((e) => e.message);
    expect(skipAll).toMatch(/Nenhum exercício/);
  });
  it('superset por supersetGroup; grupo com 1 só membro é ignorado', async () => {
    const o = JSON.parse(JSON.stringify(BRIEF)); const sup = (n: string, g?: string) => ({ name: n, sets: [{ reps: 10, weight: 10 }], ...(g ? { supersetGroup: g } : {}) });
    o.days[0].exercises = [sup('Supino plano com barra', 'A'), sup('Aberturas com halteres', 'A'), sup('Remada curvada com barra', 'B')];
    const e = (await plans.getPlan((await importAuto(parsed(o))).planId))!.days[0]!.exercises;
    expect(e[0]!.supersetGroup).toBeTruthy(); expect(e[0]!.supersetGroup).toBe(e[1]!.supersetGroup); expect(e[2]!.supersetGroup).toBeNull();
  });
  it('JSON inválido: nada é criado (a validação bloqueia antes)', async () => {
    const bad = parsePlanJson(JSON.stringify({ ...BRIEF, days: [{ name: 'D', exercises: [{ name: 'X', sets: [{ reps: 'muitas' }] }] }] }));
    expect(bad.ok).toBe(false);
    expect(await plans.listPlans(A)).toHaveLength(0);
  });
  it('atomicidade: erro a meio → nenhum plano e personalizados desfeitos', async () => {
    const o = JSON.parse(JSON.stringify(BRIEF));
    o.days[0].exercises.push({ name: 'Nova Máquina Atomica Kkk', muscleGroups: { primary: ['chest'] }, sets: [{ reps: 10, weight: 10 }] });
    const plan = parsed(o); plan.days[0]!.exercises[1]!.sets[0]!.repMin = null as any; // viola NOT NULL → SQL falha a meio
    await expect(applyImport(A, plan, (await resolveImport(A, plan)).map((r) => r.map(defaultDecision)))).rejects.toThrow();
    expect(await plans.listPlans(A)).toHaveLength(0);
    expect(await searchExercises(A, { query: 'Nova Máquina Atomica' })).toHaveLength(0);
    expect((await db.getAllAsync('SELECT * FROM plan_days')).length).toBe(0);
  });
});

describe('exportar', () => {
  it('ida e volta: exportar → validar → importar → exportar dá o mesmo plano', async () => {
    const first = await importAuto(parsed(BRIEF));
    const json1 = await exportPlan(A, first.planId);
    const second = await importAuto(parsed(json1));
    const json2 = await exportPlan(A, second.planId);
    expect(json2).toEqual(json1);
    expect(JSON.parse(JSON.stringify(json1))).toEqual(json1);
    expect((json1 as any).days[0].exercises[0].sets).toHaveLength(4);
  });
  it('séries heterogéneas (drop/rest-pause/falha) e superset sobrevivem à ida e volta', async () => {
    const id = await plans.createPlan(A, 'Mix'); const day = (await plans.getPlan(id))!.days[0]!.id;
    const ex = async (q: string) => (await searchExercises(A, { query: q }))[0]!.id;
    const p1 = await plans.addExerciseToDay(id, day, await ex('Supino plano com barra'), { weight: 60, sets: 2, dropSets: 1, restPauseSets: 1, lastSetToFailure: true, warmups: 1 });
    await plans.addExerciseToDay(id, day, await ex('Aberturas com halteres'), { weight: 14 }); await plans.toggleSupersetWithPrevious(id, day, p1).catch(() => {});
    const json = await exportPlan(A, id);
    const copy = (await plans.getPlan((await importAuto(parsed(json))).planId))!.days[0]!.exercises[0]!;
    const orig = (await plans.getPlan(id))!.days[0]!.exercises[0]!;
    expect(copy.sets.map((s) => [s.type, s.repMin, s.repMax, s.weight, s.restSeconds])).toEqual(orig.sets.map((s) => [s.type, s.repMin, s.repMax, s.weight, s.restSeconds]));
    expect(copy.sets.map((s) => s.type)).toEqual(['warmup', 'working', 'failure', 'drop', 'rest_pause']);
  });
  it('só exporta planos do próprio utilizador', async () => {
    const mine = await importAuto(parsed(BRIEF)); const theirs = await importAuto(parsed({ ...BRIEF, name: 'Do B' }), B);
    await expect(exportPlan(A, theirs.planId)).rejects.toThrow(/não encontrado/);
    expect(((await exportAllPlans(A)) as any).plans.map((p: any) => p.name)).toEqual(['Upper Body']);
    expect(((await exportAllPlans(B)) as any).plans.map((p: any) => p.name)).toEqual(['Do B']);
    void mine;
  });
  it('exercícios personalizados, histórico e nutrição', async () => {
    await createCustomExercise(A, { namePt: 'Meu exercício', primary: ['chest'], equipment: 'machine' });
    await createCustomExercise(B, { namePt: 'Do B', primary: ['back'], equipment: 'cable' });
    const ce = (await exportCustomExercises(A)) as any;
    expect(ce.type).toBe('custom_exercises'); expect(ce.exercises.map((e: any) => e.namePt)).toEqual(['Meu exercício']);

    const r = await importAuto(parsed(BRIEF));
    const sid = await sessions.startSession(A, r.planId, (await plans.getPlan(r.planId))!.days[0]!.id);
    for (const s of (await sessions.getSession(sid))!.exercises[0]!.sets) await sessions.completeSet(sid, s.id);
    await sessions.finishSession(A, sid);
    await sessions.startSession(A, null, null); // sessão ativa: não entra no histórico
    const h = (await exportHistory(A)) as any;
    expect(h.sessions).toHaveLength(1); expect(h.sessions[0].exercises[0].sets).toHaveLength(4); expect(h.sessions[0].totalVolumeKg).toBe(60 * 8 * 3);
    expect((await exportHistory(B) as any).sessions).toEqual([]);

    const f = await foods.saveFood(A, { name: 'Aveia', brand: null, barcode: null, baseUnit: 'g', per100: { kcal: 370, protein: 13, carbs: 60, fat: 7 }, servingSize: null, servingLabel: null, unitWeight: null, source: 'custom' });
    await nut.logFood(A, { date: '2026-11-15', meal: 'breakfast', food: f, quantity: 80, unit: 'g' });
    await nut.setGoal(A, { calories: 2500, protein: 150, carbs: 280, fat: 70 }, '2026-01-01');
    const n = (await exportNutrition(A)) as any;
    expect(n.type).toBe('nutrition_data'); expect(n.entries[0]).toMatchObject({ date: '2026-11-15', kcal: 296 }); expect(n.goals[0].calories).toBe(2500); expect(n.foods[0].name).toBe('Aveia');
    expect(((await exportNutrition(B)) as any).entries).toEqual([]);
    expect((await exportByKind(A, 'plans') as any).type).toBe('workout_plans');
    for (const k of ['plans', 'custom_exercises', 'history', 'nutrition'] as const) expect((await exportByKind(A, k) as any).schemaVersion).toBe('1.0');
  });
});
