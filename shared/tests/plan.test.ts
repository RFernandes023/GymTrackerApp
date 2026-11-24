import { describe, it, expect } from 'vitest';
import { buildSets, DEFAULT_CONFIG, inferConfig, validateConfig } from '../src';

describe('configuração → séries do plano', () => {
  it('3 séries efetivas por defeito', () => {
    const s = buildSets({ ...DEFAULT_CONFIG, weight: 60 });
    expect(s.map((x) => x.type)).toEqual(['working', 'working', 'working']);
    expect(s.every((x) => x.weight === 60 && x.repMin === 8 && x.repMax === 12)).toBe(true);
    expect(s.map((x) => x.position)).toEqual([0, 1, 2]);
  });
  it('aquecimento a ~50% arredondado ao incremento, antes das efetivas', () => {
    const s = buildSets({ ...DEFAULT_CONFIG, weight: 60, warmups: 1 });
    expect(s[0]).toMatchObject({ type: 'warmup', weight: 30, restSeconds: 60 });
    expect(s).toHaveLength(4);
  });
  it('drop sets em cascata sem descanso, descanso só no fim', () => {
    const s = buildSets({ ...DEFAULT_CONFIG, weight: 60, sets: 1, dropSets: 2 });
    expect(s.map((x) => x.type)).toEqual(['working', 'drop', 'drop']);
    expect(s[1]!.weight).toBeLessThan(60); expect(s[2]!.weight).toBeLessThan(s[1]!.weight);
    expect(s.map((x) => x.restSeconds)).toEqual([90, 0, 90]);
  });
  it('rest-pause e última série até à falha', () => {
    const s = buildSets({ ...DEFAULT_CONFIG, weight: 40, sets: 2, restPauseSets: 2, lastSetToFailure: true });
    expect(s.map((x) => x.type)).toEqual(['working', 'failure', 'rest_pause', 'rest_pause']);
    expect(s[2]!.restSeconds).toBe(20);
  });
  it('inferConfig é o inverso de buildSets', () => {
    const cfg = { ...DEFAULT_CONFIG, weight: 50, warmups: 1, sets: 4, dropSets: 1, increment: 1.25 };
    const back = inferConfig({ weightIncrement: 1.25, restSeconds: 90, notes: null, goal: 'hypertrophy', sets: buildSets(cfg) });
    expect(back).toMatchObject({ warmups: 1, sets: 4, dropSets: 1, weight: 50, repMin: 8, repMax: 12 });
  });
  it('validação', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toBeNull();
    expect(validateConfig({ ...DEFAULT_CONFIG, sets: 0 })).toMatch(/séries/);
    expect(validateConfig({ ...DEFAULT_CONFIG, repMin: 10, repMax: 8 })).toMatch(/repetições/);
    expect(validateConfig({ ...DEFAULT_CONFIG, increment: 0 })).toMatch(/incremento/);
  });
});
