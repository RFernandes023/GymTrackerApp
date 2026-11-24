import { describe, it, expect } from 'vitest';
import { stepWeight, formatWeight, totalVolume, dropSetWeight, suggestDoubleProgression, isStagnant, detectPersonalRecords, estimate1RM, weeklyStreak, isoWeekStart, setsPerMuscle, type LoggedSet } from '../src';

const w = (weight: number, reps: number, type: LoggedSet['type'] = 'working'): LoggedSet => ({ weight, reps, type });

describe('cargas', () => {
  it('passo configurável com precisão', () => {
    expect(stepWeight(60, 2.5, 1)).toBe(62.5);
    expect(stepWeight(20, 1.25, 1)).toBe(21.25);
    expect(stepWeight(1, 2.5, -1)).toBe(0);
  });
  it('formata em pt-PT', () => { expect(formatWeight(62.5)).toBe('62,5'); expect(formatWeight(60)).toBe('60'); });
  it('volume ignora aquecimento', () => expect(totalVolume([w(20, 15, 'warmup'), w(60, 10), w(60, 8)])).toBe(1080));
  it('drop set arredonda para baixo ao incremento', () => {
    expect(dropSetWeight(60, 2.5)).toBe(47.5);
    expect(dropSetWeight(60, 2.5)).toBeLessThan(60);
  });
  it('1RM estimado', () => { expect(estimate1RM(100, 1)).toBe(100); expect(estimate1RM(60, 12)).toBe(84); });
});

describe('double progression', () => {
  it('exemplo do brief: 3×12 a 60 kg → sugere 62,5 kg', () => {
    const p = suggestDoubleProgression({ lastSets: [w(60, 12), w(60, 12), w(60, 12)], repMin: 8, repMax: 12, increment: 2.5 })!;
    expect(p.kind).toBe('increase_weight');
    expect(p.suggestedWeight).toBe(62.5);
    expect(p.message).toContain('62,5 kg');
  });
  it('dentro do intervalo → mais uma repetição', () => {
    const p = suggestDoubleProgression({ lastSets: [w(60, 10), w(60, 9), w(60, 9)], repMin: 8, repMax: 12, increment: 2.5 })!;
    expect(p.kind).toBe('increase_reps'); expect(p.suggestedReps).toBe(10); expect(p.suggestedWeight).toBe(60);
  });
  it('abaixo do mínimo → manter', () => {
    expect(suggestDoubleProgression({ lastSets: [w(60, 7), w(60, 8)], repMin: 8, repMax: 12, increment: 2.5 })!.kind).toBe('hold');
  });
  it('aquecimentos não contam; sem séries efetivas → null', () => {
    expect(suggestDoubleProgression({ lastSets: [w(20, 15, 'warmup')], repMin: 8, repMax: 12, increment: 2.5 })).toBeNull();
  });
});

describe('estagnação e recordes', () => {
  it('estagnado quando 3 sessões não superam o anterior', () => {
    expect(isStagnant([80, 85, 84, 85, 83])).toBe(true);
    expect(isStagnant([80, 85, 84, 86, 83])).toBe(false);
    expect(isStagnant([80, 81])).toBe(false);
  });
  it('sem histórico não há recorde', () => expect(detectPersonalRecords([w(100, 5)], [])).toEqual([]));
  it('deteta recorde de carga e de 1RM', () => {
    const r = detectPersonalRecords([w(65, 8)], [w(60, 10), w(60, 8)]);
    expect(r.map((x) => x.kind)).toEqual(['weight', 'e1rm']);
  });
  it('mais repetições com a mesma carga → só 1RM', () => {
    expect(detectPersonalRecords([w(60, 12)], [w(60, 10)]).map((x) => x.kind)).toEqual(['e1rm']);
  });
});

describe('semanas', () => {
  const d = (y: number, m: number, day: number) => new Date(y, m, day, 12).getTime();
  it('semana ISO começa à segunda', () => {
    expect(new Date(isoWeekStart(d(2026, 10, 15))).getDate()).toBe(9); // domingo 15 Nov 2026 → segunda 9
    expect(new Date(isoWeekStart(d(2026, 10, 9))).getDate()).toBe(9);
  });
  it('sequência semanal', () => {
    const now = d(2026, 10, 15);
    expect(weeklyStreak([d(2026, 10, 10), d(2026, 10, 3), d(2026, 9, 27)], now)).toBe(3);
    expect(weeklyStreak([d(2026, 10, 10), d(2026, 9, 20)], now)).toBe(1); // falha numa semana
    expect(weeklyStreak([], now)).toBe(0);
    expect(weeklyStreak([d(2026, 9, 1)], now)).toBe(0);
  });
  it('séries por músculo', () => {
    expect(setsPerMuscle([{ muscle: 'chest', type: 'working' }, { muscle: 'chest', type: 'warmup' }, { muscle: 'back', type: 'working' }])).toEqual({ chest: 1, back: 1 });
  });
});
