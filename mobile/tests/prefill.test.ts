import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { freshDb, type TestDb } from './testDb';

let db: TestDb;
vi.mock('../database/db', () => ({ getDb: async () => db }));
vi.mock('../utils/uuid', () => ({ uuid: () => randomUUID() }));

import { searchExercises } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import { saveBasics } from '../features/profile/profileRepo';
import * as meas from '../features/progress/measurementsRepo';

const A = 'user-a', B = 'user-b';
beforeEach(async () => { db = await freshDb(); });
const find = async (q: string) => (await searchExercises(A, { query: q }))[0]!;
const newPlan = async (name: string, goal?: 'hypertrophy' | 'strength' | 'endurance') => {
  const planId = await plans.createPlan(A, name, undefined, goal);
  return { planId, dayId: (await plans.getPlan(planId))!.days[0]!.id };
};

describe('pré-preenchimento de cargas', () => {
  it('sem perfil nem histórico: carga 0 (nunca inventa)', async () => {
    const { planId, dayId } = await newPlan('P');
    await plans.addExerciseToDay(planId, dayId, (await find('Supino plano com barra')).id);
    expect((await plans.getPlan(planId))!.days[0]!.exercises[0]!.sets[0]!.weight).toBe(0);
  });

  it('1.ª vez com perfil: estimativa pelo peso/idade/sexo e reps pelo objetivo', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
    const hyp = await newPlan('H', 'hypertrophy');
    await plans.addExerciseToDay(hyp.planId, hyp.dayId, (await find('Supino plano com barra')).id);
    const h = (await plans.getPlan(hyp.planId))!.days[0]!.exercises[0]!;
    expect(h.sets[0]).toMatchObject({ weight: 32.5, repMin: 8, repMax: 12 });
    expect(h.sets).toHaveLength(3);
    const str = await newPlan('F', 'strength');
    await plans.addExerciseToDay(str.planId, str.dayId, (await find('Supino plano com barra')).id);
    const s = (await plans.getPlan(str.planId))!.days[0]!.exercises[0]!;
    expect(s.sets[0]!.weight).toBeGreaterThan(h.sets[0]!.weight);
    expect(s.sets[0]).toMatchObject({ repMin: 3, repMax: 6, restSeconds: 180 });
    expect(s.sets).toHaveLength(4);
  });

  it('exercício já conhecido: usa a carga real do histórico, mesmo noutro plano', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
    const bench = await find('Supino plano com barra');
    const p1 = await newPlan('P1');
    await plans.addExerciseToDay(p1.planId, p1.dayId, bench.id);
    const sid = await sessions.startSession(A, p1.planId, p1.dayId);
    for (const s of (await sessions.getSession(sid))!.exercises[0]!.sets) { await sessions.updateSet(s.id, { weight: 70, reps: 9 }); await sessions.completeSet(sid, s.id); }
    await sessions.finishSession(A, sid);
    const p2 = await newPlan('P2');
    await plans.addExerciseToDay(p2.planId, p2.dayId, bench.id);
    expect((await plans.getPlan(p2.planId))!.days[0]!.exercises[0]!.sets[0]!.weight).toBe(70);
    // e a sessão nova abre com o último peso/reps
    const s2 = await sessions.startSession(A, p2.planId, p2.dayId);
    expect((await sessions.getSession(s2))!.exercises[0]!.sets.map((x) => [x.weight, x.reps])).toEqual([[70, 9], [70, 9], [70, 9]]);
  });

  it('pré-visualização não inicia treino e indica a origem dos valores', async () => {
    await saveBasics(A, { sex: 'female', age: 28, heightCm: 165, weightKg: 60 });
    const { planId, dayId } = await newPlan('P');
    const peId = await plans.addExerciseToDay(planId, dayId, (await find('Leg Press')).id, { weight: 0 });
    await plans.addExerciseToDay(planId, dayId, (await find('Barbell Curl')).id, { weight: 25 });
    const plan = (await plans.getPlan(planId))!;
    // zera pesos do 1.º para forçar estimativa
    await plans.updateExercise(planId, peId, { ...plans.inferConfig(plan.days[0]!.exercises[0]!), weight: 0 });
    const planned = await sessions.planSessionExercises(A, (await plans.getPlan(planId))!.days[0]!, 'hypertrophy');
    expect(planned[0]!.sets[0]).toMatchObject({ source: 'estimate' });
    expect(planned[0]!.sets[0]!.weight).toBeGreaterThan(0);
    expect(planned[0]!.estimateNote).toBeTruthy();
    expect(planned[1]!.sets[0]).toMatchObject({ source: 'plan', weight: 25 });
    expect(await sessions.getActiveSessionId(A)).toBeNull(); // pré-visualizar não cria sessão
  });

  it('treino livre: exercício adicionado usa estimativa; peso corporal fica a 0', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
    const sid = await sessions.startSession(A, null, null);
    await sessions.addExerciseToSession(A, sid, (await find('Barbell Squat')).id);
    expect((await sessions.getSession(sid))!.exercises[0]!.sets[0]!.weight).toBeGreaterThan(0);
    await sessions.addExerciseToSession(A, sid, (await find('Pullups')).id);
    expect((await sessions.getSession(sid))!.exercises[1]!.sets[0]!.weight).toBe(0);
  });
});

describe('evolução física', () => {
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  it('IMC automático, estimativas marcadas, perfil sem preencher → sem estimativas', async () => {
    const a = await meas.saveMeasurement(A, { date: today(), weight: 80 });
    expect(a).toMatchObject({ bmi: null, bodyFat: null, muscleMass: null });
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180 });
    const b = await meas.saveMeasurement(A, { date: ago(1), weight: 80 });
    expect(b.bmi).toBe(24.7); expect(b.bodyFatSource).toBe('estimate'); expect(b.muscleSource).toBe('estimate');
    const c = await meas.saveMeasurement(A, { date: ago(2), weight: 80, bodyFat: 15, muscleMass: 38 });
    expect(c).toMatchObject({ bodyFat: 15, bodyFatSource: 'measured', muscleMass: 38, muscleSource: 'measured' });
  });
  it('um registo por dia (atualiza), validações, medidas personalizadas', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180 });
    const a = await meas.saveMeasurement(A, { date: today(), weight: 80 });
    const b = await meas.saveMeasurement(A, { date: today(), weight: 79.5, waist: 84 });
    expect(b.id).toBe(a.id); expect((await meas.listMeasurements(A))).toHaveLength(1);
    await expect(meas.saveMeasurement(A, { date: today() })).rejects.toThrow(/pelo menos/);
    await expect(meas.saveMeasurement(A, { date: today(), weight: 5 })).rejects.toThrow(/intervalo/);
    await expect(meas.saveMeasurement(A, { date: '2999-01-01', weight: 80 })).rejects.toThrow(/futura/);
    await expect(meas.saveMeasurement(A, { date: '2026-02-30', weight: 80 })).rejects.toThrow(/inválida/);
    const c = await meas.saveMeasurement(A, { date: ago(3), custom: { 'Pulso': 17.5 } });
    expect(c.custom).toEqual({ Pulso: 17.5 });
    expect(meas.pointsFor(await meas.listMeasurements(A), 'custom:Pulso')).toEqual([{ date: ago(3), value: 17.5 }]);
  });
  it('peso atual alimenta o perfil (e cálculo de cargas); apagar reverte', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180, weightKg: 70 });
    const { getBodyInfo } = await import('../features/profile/profileRepo');
    expect((await getBodyInfo(A))!.weightKg).toBe(70);
    const m = await meas.saveMeasurement(A, { date: today(), weight: 82 });
    expect((await getBodyInfo(A))!.weightKg).toBe(82);
    await meas.deleteMeasurement(A, m.id);
    expect((await meas.listMeasurements(A))).toHaveLength(0);
    expect((await getBodyInfo(A))!.weightKg).toBe(82); // sem registos, mantém o último valor do perfil
  });
  it('séries, comparação mensal, resumo semanal e isolamento', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180 });
    for (const [d, w] of [[ago(40), 84], [ago(20), 82], [ago(10), 81], [ago(1), 80]] as const) await meas.saveMeasurement(A, { date: d, weight: w });
    expect((await meas.metricSeries(A, 'weight', 30)).map((p) => p.value)).toEqual([82, 81, 80]);
    expect((await meas.metricSeries(A, 'weight', null))).toHaveLength(4);
    expect((await meas.metricSeries(A, 'bmi', null))[0]!.value).toBeGreaterThan(20);
    const w = await meas.weeklySummary(A);
    expect(w.weightDelta).toBe(-1); // 81 → 80 nos últimos 14 dias
    expect(w).toMatchObject({ workouts: 0, kcalAvg: null });
    expect(await meas.listMeasurements(B)).toHaveLength(0);
    expect(await meas.metricSeries(B, 'weight', null)).toEqual([]);
  });
  it('dashboard: cartões de evolução com dados reais', async () => {
    const { dashboardStats } = await import('../features/workouts/statsRepo');
    expect((await dashboardStats(A)).body.weight).toBeNull();
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180 });
    await meas.saveMeasurement(A, { date: ago(60), weight: 84, waist: 90 });
    await meas.saveMeasurement(A, { date: ago(1), weight: 80, waist: 86, bodyFat: 15 });
    const b = (await dashboardStats(A)).body;
    expect(b.weight!.value).toBe(80); expect(b.bmi).toBe(24.7);
    expect(b.bodyFat).toMatchObject({ value: 15, source: 'measured' });
    expect(b.muscleMass!.value).toBeGreaterThan(0);
    expect(b.waist!.value).toBe(86); expect(b.waist!.delta90).toBe(-4);
    expect((await dashboardStats(B)).body.weight).toBeNull();
  });
});

describe('objetivo do plano', () => {
  it('mudar o objetivo do plano afeta exercícios adicionados depois; cópia mantém objetivo', async () => {
    const planId = await plans.createPlan(A, 'F', undefined, 'strength');
    expect((await plans.getPlan(planId))!.goal).toBe('strength');
    await plans.updatePlan(planId, { goal: 'endurance' });
    const dayId = (await plans.getPlan(planId))!.days[0]!.id;
    await plans.addExerciseToDay(planId, dayId, (await find('Barbell Squat')).id);
    expect((await plans.getPlan(planId))!.days[0]!.exercises[0]!.sets[0]).toMatchObject({ repMin: 15, repMax: 20, restSeconds: 60 });
    expect((await plans.getPlan(await plans.duplicatePlan(planId)))!.goal).toBe('endurance');
  });
});
