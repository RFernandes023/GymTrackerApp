import { describe, it, expect } from 'vitest';
import { calculateBmi, calculateBmr, calculateTdee, estimateTargets, elapsedMs, remainingMs, formatDuration, DASHBOARD_CARD_DEFS } from '../src';

describe('nutrition', () => {
  it('IMC', () => expect(calculateBmi(80, 180)).toBe(24.7));
  it('Mifflin-St Jeor homem', () => expect(calculateBmr({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 })).toBe(1780));
  it('Mifflin-St Jeor mulher', () => expect(calculateBmr({ sex: 'female', age: 30, heightCm: 165, weightKg: 60 })).toBe(1320));
  it('TDEE', () => expect(calculateTdee(1780, 'moderate')).toBe(2759));
  it('metas: macros somam ~ calorias', () => {
    const t = estimateTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 }, 'moderate', 'muscle_gain');
    expect(t.calories).toBe(3035);
    expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.calories)).toBeLessThan(10);
  });
  it('rejeita valores inválidos', () => expect(() => calculateBmi(0, 180)).toThrow(RangeError));
});

describe('tempo por timestamps', () => {
  it('não depende de ticks', () => expect(elapsedMs(1_000, 61_000)).toBe(60_000));
  it('desconta pausas', () => expect(elapsedMs(0, 100_000, 30_000)).toBe(70_000));
  it('nunca negativo', () => { expect(elapsedMs(10, 5)).toBe(0); expect(remainingMs(5, 10)).toBe(0); });
  it('formata', () => { expect(formatDuration(65_000)).toBe('01:05'); expect(formatDuration(3_725_000)).toBe('1:02:05'); });
});

describe('dashboard defs', () => {
  it('tipos únicos', () => expect(new Set(DASHBOARD_CARD_DEFS.map(d => d.type)).size).toBe(DASHBOARD_CARD_DEFS.length));
});
