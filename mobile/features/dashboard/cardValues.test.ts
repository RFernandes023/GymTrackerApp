import { describe, expect, it, vi } from 'vitest';
vi.mock('../workouts/statsRepo', () => ({}));
import { cardValue, bmiCategory } from './cardValues';
import { DASHBOARD_CARD_DEFS } from '@gym/shared';

const empty = { lastWorkout: null, weekWorkouts: 0, weekVolume: 0, avgDurationMs: null, streakWeeks: 0, prCount30: 0, lastPr: null, nextWorkout: null, todayWorkout: null, nutrition: { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, goal: null }, body: { weight: null, bmi: null, bodyFat: null, muscleMass: null, waist: null, weekly: { workouts: 0, prevWorkouts: 0, volume: 0, prevVolume: 0, kcalAvg: null, proteinAvg: null, daysLogged: 0, goalKcal: null, weightDelta: null } } };

describe('valores dos cartões', () => {
  it('sem dados → null (exceto contagem semanal = 0)', () => {
    for (const d of DASHBOARD_CARD_DEFS) if (d.type !== 'week_workouts') expect(cardValue(d.type, empty as any)).toBeNull();
    expect(cardValue('week_workouts', empty as any)!.value).toBe('0');
  });
  it('com dados', () => {
    const s = { ...empty, weekWorkouts: 3, weekVolume: 12500, streakWeeks: 4, avgDurationMs: 3_600_000, nextWorkout: { planName: 'PPL', dayId: 'd', planId: 'p', dayName: 'Push' } };
    expect(cardValue('next_workout', s as any)).toMatchObject({ value: 'Push', sub: 'PPL' });
    expect(cardValue('streak', s as any)!.value).toBe('4 sem.');
    expect(cardValue('avg_duration', s as any)!.value).toBe('60 min');
    expect(cardValue('week_workouts', s as any)!.sub).toBe('treinos esta semana');
  });
  it('nutrição', () => {
    const goal = { calories: 2500, protein: 160, carbs: 280, fat: 70, startDate: '2026-01-01' };
    const s = { ...empty, nutrition: { totals: { kcal: 1250, protein: 80, carbs: 140, fat: 35, fiber: 10 }, goal } };
    expect(cardValue('kcal_consumed', s as any)).toMatchObject({ sub: expect.stringContaining('2') });
    expect(cardValue('kcal_remaining', s as any)!.sub).toBe('restantes hoje');
    expect(cardValue('daily_progress', s as any)!.value).toBe('50 %');
    expect(cardValue('macro_protein', s as any)!.value).toContain('80');
    expect(cardValue('kcal_remaining', { ...s, nutrition: { ...s.nutrition, totals: { ...s.nutrition.totals, kcal: 2700 } } } as any)!.sub).toBe('acima do objetivo');
    expect(cardValue('kcal_goal', empty as any)).toBeNull();
  });
});

describe('evolução', () => {
  const body = { weight: { value: 80.4, date: '2026-11-10' }, bmi: 24.8, bodyFat: { value: 18.2, source: 'estimate' as const }, muscleMass: { value: 32, source: 'measured' as const },
    waist: { value: 84, delta90: -2.5 }, weekly: { workouts: 3, prevWorkouts: 2, volume: 12000, prevVolume: 9000, kcalAvg: 2400, proteinAvg: 150, daysLogged: 5, goalKcal: 2500, weightDelta: -0.4 } };
  const s = { ...empty, body } as any;
  it('valores reais e rótulos de estimativa/medido', () => {
    expect(cardValue('weight_current', s)!.value).toContain('80');
    expect(cardValue('body_fat', s)!.sub).toBe('estimativa');
    expect(cardValue('muscle_mass', s)!.sub).toBe('medido');
    expect(cardValue('bmi', s)!.sub).toBe('peso normal');
    expect(cardValue('waist_trend', s)!.sub).toContain('2,5');
    expect(cardValue('weekly_summary', s)!.value).toBe('3 treinos');
  });
  it('sem registos → null (nunca inventa)', () => {
    for (const t of ['weight_current', 'bmi', 'body_fat', 'muscle_mass', 'waist_trend', 'weekly_summary']) expect(cardValue(t, empty as any)).toBeNull();
  });
  it('categorias de IMC', () => { expect(bmiCategory(17)).toBe('abaixo do peso'); expect(bmiCategory(27)).toBe('excesso de peso'); expect(bmiCategory(31)).toBe('obesidade'); });
});
