import { describe, it, expect } from 'vitest';
import { parsePlanJson, buildPlanJson, type ExportablePlan } from '../src';

/** Exemplo EXATO do brief (secção 10.1). */
const BRIEF = {
  schemaVersion: '1.0', type: 'workout_plan', name: 'Upper Body', description: 'Plano de hipertrofia', language: 'pt-PT',
  settings: { goal: 'hypertrophy', restBetweenExercises: 120 },
  days: [{ name: 'Upper A', dayOfWeek: 1, exercises: [{
    name: { pt: 'Supino plano com barra', en: 'Barbell Bench Press' }, muscleGroups: { primary: ['chest'], secondary: ['triceps', 'front_delts'] }, equipment: 'barbell',
    sets: [
      { type: 'warmup', reps: { min: 12, max: 15 }, weight: 20, restSeconds: 60 },
      { type: 'working', reps: { min: 8, max: 12 }, weight: 60, restSeconds: 120, rir: null },
      { type: 'working', reps: { min: 8, max: 12 }, weight: 60, restSeconds: 120, rir: null },
      { type: 'working', reps: { min: 8, max: 12 }, weight: 60, restSeconds: 120, rir: null },
    ], weightIncrement: 2.5, goal: 'hypertrophy', notes: 'Controlar a descida' }] }],
};
const ok = (o: unknown) => { const r = parsePlanJson(JSON.stringify(o)); if (!r.ok) throw new Error(r.errors.join('; ')); return r; };
const errs = (o: unknown) => { const r = parsePlanJson(typeof o === 'string' ? o : JSON.stringify(o)); return r.ok ? [] : r.errors; };
const clone = () => JSON.parse(JSON.stringify(BRIEF));

describe('formato do brief', () => {
  it('lê o exemplo oficial', () => {
    const { plan, warnings } = ok(BRIEF);
    expect(plan).toMatchObject({ name: 'Upper Body', goal: 'hypertrophy', defaultRestSeconds: 120, language: 'pt-PT' });
    const e = plan.days[0]!.exercises[0]!;
    expect(e).toMatchObject({ namePt: 'Supino plano com barra', nameEn: 'Barbell Bench Press', equipment: 'barbell', weightIncrement: 2.5, notes: 'Controlar a descida' });
    expect(e.primary).toEqual(['chest']); expect(e.secondary).toEqual(['triceps', 'shoulders']); // front_delts → shoulders
    expect(e.sets.map((s) => s.type)).toEqual(['warmup', 'working', 'working', 'working']);
    expect(e.sets[1]).toMatchObject({ repMin: 8, repMax: 12, weight: 60, restSeconds: 120, rir: null });
    expect(warnings).toEqual([]);
  });
  it('reps fixas (número) e tipos/aliases', () => {
    const o = clone(); o.days[0].exercises[0].sets = [{ type: 'drop_set', reps: 10, weight: 40 }, { type: 'to_failure', reps: 8 }, { reps: 5 }];
    const s = ok(o).plan.days[0]!.exercises[0]!.sets;
    expect(s.map((x) => x.type)).toEqual(['drop', 'failure', 'working']); expect(s[0]).toMatchObject({ repMin: 10, repMax: 10 }); expect(s[2]!.weight).toBe(0);
  });
  it('nome simples (string), superset e vários dias', () => {
    const o = clone(); o.days[0].exercises[0].name = 'Supino'; o.days[0].exercises[0].supersetGroup = 'A';
    o.days.push({ name: 'Lower', dayOfWeek: null, exercises: [{ name: { en: 'Squat' }, sets: [{ reps: 5, weight: 100 }] }] });
    const p = ok(o).plan;
    expect(p.days).toHaveLength(2); expect(p.days[0]!.exercises[0]).toMatchObject({ namePt: 'Supino', nameEn: null, supersetGroup: 'A' }); expect(p.days[1]!.exercises[0]!.displayName).toBe('Squat');
  });
  it('avisos não bloqueiam: músculo/equipamento/objetivo desconhecidos', () => {
    const o = clone(); o.days[0].exercises[0].muscleGroups.primary = ['chest', 'cerebro']; o.days[0].exercises[0].equipment = 'trampolim'; o.settings.goal = 'beleza';
    const r = ok(o);
    expect(r.warnings.length).toBe(3); expect(r.plan.goal).toBe('hypertrophy'); expect(r.plan.days[0]!.exercises[0]!.equipment).toBe('other');
  });
});

describe('JSON inválido nunca é importado', () => {
  it('sintaxe, tipo, versão', () => {
    expect(errs('{ não é json')[0]).toMatch(/JSON inválido/);
    expect(errs('[1,2]')[0]).toMatch(/objeto/);
    expect(errs({ ...BRIEF, type: 'nutrition' })[0]).toMatch(/workout_plan/);
    expect(errs({ ...BRIEF, schemaVersion: '2.0' })[0]).toMatch(/versão não suportada/i);
    expect(errs({ ...BRIEF, schemaVersion: 1 })[0]).toMatch(/schemaVersion/);
  });
  it('todos os erros com caminho do campo', () => {
    const o = clone();
    o.name = ''; o.days[0].dayOfWeek = 9;
    o.days[0].exercises[0].sets[1] = { type: 'xpto', reps: { min: 12, max: 8 }, weight: -5, restSeconds: 5000, rir: 9 };
    o.days[0].exercises[0].weightIncrement = 0;
    const e = errs(o).join('\n');
    for (const p of ['name:', 'days[0].dayOfWeek', 'days[0].exercises[0].sets[1].type', 'days[0].exercises[0].sets[1].reps', 'days[0].exercises[0].sets[1].weight', 'days[0].exercises[0].sets[1].restSeconds', 'days[0].exercises[0].sets[1].rir', 'weightIncrement']) expect(e).toContain(p);
  });
  it('estruturas em falta e limites', () => {
    expect(errs({ ...BRIEF, days: [] })[0]).toMatch(/days/);
    expect(errs({ ...BRIEF, days: [{ name: 'D', exercises: [] }] })[0]).toMatch(/exercises/);
    const o = clone(); o.days[0].exercises[0].sets = []; expect(errs(o)[0]).toMatch(/sets/);
    const n = clone(); n.days[0].exercises[0].name = {}; expect(errs(n)[0]).toMatch(/nome/);
    const big = clone(); big.days = Array.from({ length: 8 }, (_, i) => ({ ...big.days[0], name: `D${i}` })); expect(errs(big)[0]).toMatch(/1 a 7/);
  });
  it('limita o nº de erros a 30', () => {
    const o = clone(); o.days[0].exercises[0].sets = Array.from({ length: 15 }, () => ({ reps: 'x', weight: 'y', restSeconds: 'z', rir: 'w', type: 'q' }));
    expect(errs(o).length).toBeLessThanOrEqual(30);
  });
});

describe('exportação → importação (ida e volta)', () => {
  const plan: ExportablePlan = { name: 'PPL', description: 'x', goal: 'strength', days: [{ name: 'Push', dayOfWeek: 1, exercises: [
    { namePt: 'Supino', nameEn: 'Bench', primary: ['chest'], secondary: ['triceps'], equipment: 'barbell', weightIncrement: 2.5, goal: 'strength', notes: 'n', supersetGroup: 'g1',
      sets: [{ type: 'warmup', repMin: 12, repMax: 15, weight: 20, restSeconds: 60, rir: null }, { type: 'working', repMin: 5, repMax: 5, weight: 80, restSeconds: 180, rir: 2 }, { type: 'drop', repMin: 8, repMax: 10, weight: 60, restSeconds: 0, rir: null }] },
    { namePt: null, nameEn: 'Dips', primary: ['triceps'], secondary: [], equipment: 'bodyweight', weightIncrement: 2.5, goal: null, notes: null, supersetGroup: 'g1', sets: [{ type: 'working', repMin: 8, repMax: 12, weight: 0, restSeconds: null, rir: null }] }] }] };
  it('o que se exporta volta igual', () => {
    const json = buildPlanJson(plan);
    const r = ok(json).plan;
    expect(r.name).toBe('PPL'); expect(r.goal).toBe('strength');
    const e = r.days[0]!.exercises;
    expect(e[0]!.sets).toEqual([{ type: 'warmup', repMin: 12, repMax: 15, weight: 20, restSeconds: 60, rir: null }, { type: 'working', repMin: 5, repMax: 5, weight: 80, restSeconds: 180, rir: 2 }, { type: 'drop', repMin: 8, repMax: 10, weight: 60, restSeconds: 0, rir: null }]);
    expect(e[0]!.supersetGroup).toBe('g1'); expect(e[1]!.supersetGroup).toBe('g1'); expect(e[1]!.namePt).toBe('Dips'); // sem PT usa o inglês
    expect(JSON.parse(JSON.stringify(json))).toEqual(json); // JSON válido e estável
  });
});

import { splitBundle } from '../src';
describe('pacote com vários planos', () => {
  it('separa; ignora o que não é pacote', () => {
    expect(splitBundle(JSON.stringify({ type: 'workout_plans', plans: [BRIEF, BRIEF] }))).toHaveLength(2);
    expect(splitBundle(JSON.stringify(BRIEF))).toBeNull();
    expect(splitBundle('lixo')).toBeNull();
  });
});
