import { describe, it, expect } from 'vitest';
import { suggestStartingWeight, defaultIncrement, GOAL_DEFAULTS, type BodyInfo, type ExerciseInfo } from '../src';

const man: BodyInfo = { sex: 'male', age: 30, heightCm: 180, weightKg: 80 };
const woman: BodyInfo = { sex: 'female', age: 28, heightCm: 165, weightKg: 60 };
const ex = (nameEn: string, equipment: string, primary: string[], type: string | null = 'compound'): ExerciseInfo => ({ nameEn, equipment, primary, type });

describe('carga inicial sugerida', () => {
  it('supino com barra, homem 80 kg, hipertrofia ≈ 32,5 kg', () => {
    expect(suggestStartingWeight(ex('Barbell Bench Press - Medium Grip', 'barbell', ['chest']), man, 'hypertrophy')!.weight).toBe(32.5);
  });
  it('agachamento e peso-morto razoáveis para iniciante', () => {
    expect(suggestStartingWeight(ex('Barbell Squat', 'barbell', ['quads']), man)!.weight).toBe(40);
    expect(suggestStartingWeight(ex('Barbell Deadlift', 'barbell', ['hamstrings', 'glutes']), man)!.weight).toBe(50);
  });
  it('força usa carga maior que hipertrofia, resistência menor', () => {
    const e = ex('Barbell Squat', 'barbell', ['quads']);
    const f = (g: 'hypertrophy' | 'strength' | 'endurance') => suggestStartingWeight(e, man, g)!.weight;
    expect(f('strength')).toBeGreaterThan(f('hypertrophy'));
    expect(f('hypertrophy')).toBeGreaterThan(f('endurance'));
  });
  it('mulher: menos carga; mínimo a barra vazia (20 kg) em compostos', () => {
    const w = suggestStartingWeight(ex('Barbell Bench Press - Medium Grip', 'barbell', ['chest']), woman)!;
    expect(w.weight).toBe(20); expect(w.note).toMatch(/barra/);
    const m = suggestStartingWeight(ex('Barbell Squat', 'barbell', ['quads']), woman)!.weight;
    expect(m).toBeLessThan(suggestStartingWeight(ex('Barbell Squat', 'barbell', ['quads']), man)!.weight);
  });
  it('halteres: valor por haltere, passos de 2 kg', () => {
    const w = suggestStartingWeight(ex('Dumbbell Bench Press', 'dumbbell', ['chest']), man)!;
    expect(w.perHand).toBe(true); expect(w.weight % 2).toBe(0); expect(w.weight).toBeLessThan(20);
  });
  it('idade reduz; IMC alto não infla a carga', () => {
    const e = ex('Barbell Squat', 'barbell', ['quads']);
    expect(suggestStartingWeight(e, { ...man, age: 65 })!.weight).toBeLessThan(suggestStartingWeight(e, man)!.weight);
    const heavy = suggestStartingWeight(e, { ...man, weightKg: 140 })!.weight;
    expect(heavy).toBeLessThanOrEqual(suggestStartingWeight(e, { ...man, weightKg: 100 })!.weight + 5);
  });
  it('nível mais alto → mais carga', () => {
    const e = ex('Leg Press', 'machine', ['quads']);
    expect(suggestStartingWeight(e, { ...man, level: 'intermediate' })!.weight).toBeGreaterThan(suggestStartingWeight(e, man)!.weight);
  });
  it('sem carga externa → null; perfil inválido → null', () => {
    expect(suggestStartingWeight(ex('Pullups', 'bodyweight', ['back']), man)).toBeNull();
    expect(suggestStartingWeight(ex('Barbell Squat', 'barbell', ['quads']), { ...man, weightKg: 0 })).toBeNull();
    expect(suggestStartingWeight(ex('Barbell Squat', 'barbell', ['quads']), { ...man, age: 5 })).toBeNull();
  });
  it('exercício desconhecido usa rácio genérico por equipamento', () => {
    const w = suggestStartingWeight(ex('Some Strange Cable Move', 'cable', ['triceps'], 'isolation'), man)!;
    expect(w.basis).toBe('generic'); expect(w.weight).toBeGreaterThan(0);
  });
  it('incrementos por equipamento e defaults por objetivo', () => {
    expect(defaultIncrement('dumbbell')).toBe(2); expect(defaultIncrement('barbell')).toBe(2.5); expect(defaultIncrement('machine')).toBe(5);
    expect(GOAL_DEFAULTS.strength.repMax).toBe(6);
  });
});
