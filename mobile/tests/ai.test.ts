import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { freshDb, type TestDb } from './testDb';

let db: TestDb;
vi.mock('../database/db', () => ({ getDb: async () => db }));
vi.mock('../utils/uuid', () => ({ uuid: () => randomUUID() }));

import { planProposal, MAX_CONTEXT_BYTES, toDateKey, type PlanProposal } from '@gym/shared';
import { searchExercises } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import * as foods from '../features/nutrition/foodsRepo';
import * as nut from '../features/nutrition/nutritionRepo';
import { saveBasics } from '../features/profile/profileRepo';
import * as meas from '../features/progress/measurementsRepo';
import * as aiRepo from '../features/ai/aiRepo';
import * as consent from '../features/ai/consent';
import { applyProposal, buildProposalDiff, resolveProposal } from '../features/ai/proposals';
import { buildContext } from '../features/ai/context';
import { localInsights } from '../features/ai/insights';
import { cardValue } from '../features/dashboard/cardValues';

const A = 'user-a@x.pt', B = 'user-b';
beforeEach(async () => { db = await freshDb(); });
const find = async (q: string) => (await searchExercises(A, { query: q }))[0]!;
const parse = (p: unknown): PlanProposal => planProposal.parse(p);

async function seedPlan(userId = A) {
  const planId = await plans.createPlan(userId, 'Meu plano');
  const push = (await plans.getPlan(planId))!.days[0]!.id;
  await plans.updateDay(planId, push, { name: 'Push' });
  await plans.addDay(planId, 'Pull');
  const pull = (await plans.getPlan(planId))!.days[1]!.id;
  const ex = async (q: string) => (await searchExercises(userId, { query: q }))[0]!.id;
  await plans.addExerciseToDay(planId, push, await ex('Supino plano com barra'), { weight: 60, sets: 3, repMin: 8, repMax: 12 });
  await plans.addExerciseToDay(planId, push, await ex('Aberturas com halteres'), { weight: 14, sets: 3, repMin: 10, repMax: 15 });
  await plans.addExerciseToDay(planId, pull, await ex('Remada curvada com barra'), { weight: 50, sets: 3 });
  return { planId, push, pull };
}
async function doSession(planId: string, dayId: string, weight: number, reps: number, userId = A) {
  const id = await sessions.startSession(userId, planId, dayId);
  for (const e of (await sessions.getSession(id))!.exercises) for (const s of e.sets) { await sessions.updateSet(s.id, { weight, reps }); await sessions.completeSet(id, s.id); }
  await sessions.finishSession(userId, id);
}

describe('resolver propostas', () => {
  it('casa por nome PT e EN; cria personalizado só com músculo; ignora o resto', async () => {
    const p = parse({ planName: 'X', days: [{ name: 'D', exercises: [
      { name: 'Supino plano com barra', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Barbell Bench Press - Medium Grip', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Exercício Inventado Xyz', muscle: 'chest', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Outro Desconhecido Qwerty', sets: 3, repMin: 8, repMax: 12 },
    ] }] });
    const r = await resolveProposal(A, p);
    expect(r.days[0]!.exercises.map((e) => e.status)).toEqual(['matched', 'matched', 'will_create', 'ignored']);
    expect(r.days[0]!.exercises[0]!.exerciseId).toBe(r.days[0]!.exercises[1]!.exerciseId);
  });
  it('targetPlanId de outro utilizador é descartado', async () => {
    const other = await seedPlan(B);
    const r = await resolveProposal(A, parse({ planName: 'X', targetPlanId: other.planId, days: [{ name: 'Push', exercises: [{ name: 'Supino plano com barra', sets: 3, repMin: 8, repMax: 12 }] }] }));
    expect(r.targetPlanId).toBeNull();
  });
});

describe('diff e aplicação (só com aprovação)', () => {
  const prop = (planId: string | null) => parse({ planName: 'Meu plano', goal: 'strength', rationale: 'mais força', targetPlanId: planId, days: [{ name: 'Push', exercises: [
    { name: 'Supino plano com barra', sets: 4, repMin: 6, repMax: 10, weight: 62.5 }, { name: 'Paralelas (peito)', sets: 3, repMin: 8, repMax: 12 }] }] });

  it('mostrar o diff NÃO altera o plano', async () => {
    const { planId } = await seedPlan();
    const before = JSON.stringify(await plans.getPlan(planId));
    const rp = await resolveProposal(A, prop(planId));
    const d = await buildProposalDiff(A, rp);
    expect(d.targetPlanName).toBe('Meu plano');
    expect(d.items.map((i) => `${i.kind}:${i.exercise}`).sort()).toEqual(['add:Paralelas (peito)', 'change:Supino plano com barra', 'remove:Aberturas com halteres']);
    expect(JSON.stringify(await plans.getPlan(planId))).toBe(before);
  });
  it('aceitar altera só o dia mencionado; outros dias e planos ficam intactos', async () => {
    const { planId, pull } = await seedPlan();
    const other = await seedPlan();
    const otherBefore = JSON.stringify(await plans.getPlan(other.planId));
    const res = await applyProposal(A, await resolveProposal(A, prop(planId)));
    expect(res).toMatchObject({ planId, added: 2, createdCustom: 0, ignored: [] });
    const plan = (await plans.getPlan(planId))!;
    expect(plan.days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    const push = plan.days[0]!;
    expect(push.exercises.map((e) => e.name)).toEqual(['Supino plano com barra', 'Paralelas (peito)']);
    expect(push.exercises[0]!.sets.filter((s) => s.type === 'working')).toHaveLength(4);
    expect(push.exercises[0]!.sets[0]).toMatchObject({ repMin: 6, repMax: 10, weight: 62.5 });
    expect(plan.days[1]!.id).toBe(pull); expect(plan.days[1]!.exercises).toHaveLength(1); // Pull intocado
    expect(JSON.stringify(await plans.getPlan(other.planId))).toBe(otherBefore);
  });
  it('plano novo: reutiliza o 1.º dia, cria exercício personalizado, ignora sem músculo, supersets e carga por defeito', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
    const p = parse({ planName: 'IA', goal: 'hypertrophy', rationale: 'r', days: [
      { name: 'Upper', dayOfWeek: 1, exercises: [
        { name: 'Supino plano com barra', sets: 3, repMin: 8, repMax: 12, weight: 50 },
        { name: 'Aberturas com halteres', sets: 3, repMin: 10, repMax: 15, supersetWithPrevious: true },
        { name: 'Máquina Fantasma Zzz', muscle: 'back', equipment: 'machine', sets: 3, repMin: 10, repMax: 12 },
        { name: 'Sem Músculo Nem Biblioteca', sets: 3, repMin: 10, repMax: 12 }] },
      { name: 'Lower', exercises: [{ name: 'Agachamento com barra', sets: 4, repMin: 6, repMax: 8 }] }] });
    const res = await applyProposal(A, await resolveProposal(A, p));
    expect(res).toMatchObject({ added: 4, createdCustom: 1, ignored: ['Sem Músculo Nem Biblioteca'] });
    const plan = (await plans.getPlan(res.planId))!;
    expect(plan.goal).toBe('hypertrophy'); expect(plan.days.map((d) => d.name)).toEqual(['Upper', 'Lower']); expect(plan.days[0]!.dayOfWeek).toBe(1);
    const up = plan.days[0]!.exercises;
    expect(up[0]!.sets[0]!.weight).toBe(50);
    expect(up[1]!.supersetGroup).toBeTruthy(); expect(up[1]!.supersetGroup).toBe(up[0]!.supersetGroup);
    expect(plan.days[1]!.exercises[0]!.sets[0]!.weight).toBeGreaterThan(0); // estimado pelo perfil
    expect((await searchExercises(A, { query: 'Máquina Fantasma' }))[0]).toMatchObject({ isCustom: true, primary: ['back'] });
    expect(await searchExercises(B, { query: 'Máquina Fantasma' })).toHaveLength(0);
  });
  it('proposta com plano alheio cria plano novo e não toca no alheio', async () => {
    const theirs = await seedPlan(B); const before = JSON.stringify(await plans.getPlan(theirs.planId));
    const res = await applyProposal(A, await resolveProposal(A, prop(theirs.planId)));
    expect(res.planId).not.toBe(theirs.planId);
    expect(JSON.stringify(await plans.getPlan(theirs.planId))).toBe(before);
    expect((await plans.listPlans(A)).map((p) => p.id)).toEqual([res.planId]);
  });
});

describe('contexto enviado à IA', () => {
  it('só os âmbitos pedidos; sem email/ids; dentro do limite', async () => {
    await saveBasics(A, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
    const { planId, push } = await seedPlan();
    await doSession(planId, push, 60, 10);
    const f = await foods.saveFood(A, { name: 'Aveia', brand: null, barcode: null, baseUnit: 'g', per100: { kcal: 370, protein: 13, carbs: 60, fat: 7 }, servingSize: null, servingLabel: null, unitWeight: null, source: 'custom' });
    await nut.logFood(A, { date: toDateKey(Date.now()), meal: 'lunch', food: f, quantity: 100, unit: 'g' });
    await nut.setGoal(A, { calories: 2500, protein: 150, carbs: 280, fat: 70 }, '2020-01-01');
    await meas.saveMeasurement(A, { date: toDateKey(Date.now()), weight: 80, waist: 85 });

    const all = await buildContext(A, ['training', 'nutrition', 'body']);
    const json = JSON.stringify(all.data);
    expect(Object.keys(all.data)).toEqual(expect.arrayContaining(['training', 'nutrition', 'body']));
    expect(json).not.toContain('user-a'); expect(json).not.toContain('@'); expect(json).not.toContain(A);
    expect(Buffer.byteLength(json)).toBeLessThan(MAX_CONTEXT_BYTES);
    const t = all.data.training as any;
    expect(t.activePlan.name).toBe('Meu plano'); expect(t.recentSessions[0].exercises[0].topSet).toBe('60kg x 10');
    expect((all.data.nutrition as any).averages.kcal).toBe(370);
    expect((all.data.body as any)).toMatchObject({ sex: 'male', heightCm: 180, weightKg: 80, waistCm: 85 });

    const only = await buildContext(A, ['nutrition']);
    expect(Object.keys(only.data).sort()).toEqual(['nutrition', 'today', 'units']);
    expect(only.data.catalog).toBeUndefined();
    expect(Object.keys((await buildContext(A, [], { includeCatalog: true })).data)).toContain('catalog');
  });
  it('isolamento: nunca inclui dados de outro utilizador', async () => {
    const b = await seedPlan(B); await doSession(b.planId, b.push, 99, 5, B);
    const ctx = await buildContext(A, ['training']);
    expect(JSON.stringify(ctx.data)).not.toContain('Meu plano');
    expect((ctx.data.training as any).activePlan).toBeNull(); expect((ctx.data.training as any).recentSessions).toEqual([]);
  });
});

describe('análise local (sem IA)', () => {
  it('estagnação', async () => {
    const { planId, push } = await seedPlan();
    for (const w of [60, 62.5, 62.5, 60, 60]) await doSession(planId, push, w, 8);
    const ins = await localInsights(A);
    expect(ins.some((i) => i.kind === 'stagnation' && i.text.includes('Supino plano com barra'))).toBe(true);
  });
  it('progressão sugerida quando todas as séries atingem o máximo', async () => {
    const { planId, push } = await seedPlan();
    await doSession(planId, push, 60, 12);
    const ins = await localInsights(A);
    expect(ins.some((i) => i.kind === 'progression' && i.text.includes('62,5 kg'))).toBe(true);
  });
  it('pouco volume só com ≥3 treinos; consistência alimentar', async () => {
    const { planId, push } = await seedPlan();
    await doSession(planId, push, 60, 10);
    expect((await localInsights(A)).some((i) => i.kind === 'low_volume')).toBe(false); // 1 treino: poucos dados
    await doSession(planId, push, 60, 10); await doSession(planId, push, 60, 10);
    const ins = await localInsights(A);
    expect(ins.some((i) => i.id === 'low:back')).toBe(true);
    const f = await foods.saveFood(A, { name: 'X', brand: null, barcode: null, baseUnit: 'g', per100: { kcal: 100, protein: 5, carbs: 10, fat: 2 }, servingSize: null, servingLabel: null, unitWeight: null, source: 'custom' });
    await nut.logFood(A, { date: toDateKey(Date.now()), meal: 'lunch', food: f, quantity: 100, unit: 'g' });
    expect((await localInsights(A)).some((i) => i.kind === 'consistency')).toBe(true);
    expect(await localInsights(B)).toEqual([]);
  });
  it('cartão do dashboard mostra a 1.ª sugestão; vazio → null', () => {
    const base: any = { lastWorkout: null, weekWorkouts: 0, weekVolume: 0, avgDurationMs: null, streakWeeks: 0, prCount30: 0, lastPr: null, nextWorkout: null, todayWorkout: null, nutrition: { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, goal: null }, body: { weight: null, bmi: null, bodyFat: null, muscleMass: null, waist: null, weekly: {} } };
    expect(cardValue('ai_suggestions', base)).toBeNull();
    const c = cardValue('ai_suggestions', { ...base, insights: [{ id: 'a', kind: 'stagnation', text: 'Sem progresso em X', priority: 1 }, { id: 'b', kind: 'nutrition', text: 'y', priority: 2 }] })!;
    expect(c.value).toBe('Estagnação'); expect(c.sub).toContain('Sem progresso em X'); expect(c.sub).toContain('+1');
  });
});

describe('conversas e consentimento', () => {
  it('guarda, atualiza estado da proposta, apaga e isola', async () => {
    const p = parse({ planName: 'X', days: [{ name: 'D', exercises: [{ name: 'Supino', sets: 3, repMin: 8, repMax: 12 }] }] });
    await aiRepo.addMessage(A, { role: 'user', content: 'olá' });
    const m = await aiRepo.addMessage(A, { role: 'assistant', content: 'proposta', proposal: p });
    expect(m.proposalStatus).toBe('pending');
    await aiRepo.setProposalStatus(A, m.id, 'accepted');
    await aiRepo.setProposalStatus(B, m.id, 'rejected'); // outro utilizador não consegue
    const list = await aiRepo.listMessages(A);
    expect(list.map((x) => x.role)).toEqual(['user', 'assistant']); expect(list[1]!.proposalStatus).toBe('accepted'); expect(list[1]!.proposal!.planName).toBe('X');
    expect(await aiRepo.listMessages(B)).toEqual([]);
    await aiRepo.clearHistory(A);
    expect(await aiRepo.listMessages(A)).toEqual([]);
  });
  it('consentimento: sem aceitar não há consentimento; âmbitos; revogar', async () => {
    expect(await consent.getConsent(A)).toBeNull();
    await consent.acceptConsent(A);
    expect((await consent.getConsent(A))!.scopes).toEqual({ training: true, nutrition: true, body: true });
    await consent.setScopes(A, { training: true, nutrition: false, body: false });
    expect((await consent.getConsent(A))!.scopes.nutrition).toBe(false);
    expect(await consent.getConsent(B)).toBeNull();
    await consent.revokeConsent(A);
    expect(await consent.getConsent(A)).toBeNull();
    expect(consent.CONSENT_POINTS.join(' ')).toMatch(/Google pode usar o conteúdo/);
  });
});
