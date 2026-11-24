import { describe, it, expect } from 'vitest';
import { estimateBodyFatFromBmi, estimateBodyFatNavy, estimateMuscleMass, leanMass, validateMeasurement, deriveMetrics, chartLayout, filterRange, monthlyComparison, trend } from '../src';

describe('estimativas corporais', () => {
  it('Deurenberg: homem 30 anos IMC 24,7 ≈ 20,5 %', () => expect(estimateBodyFatFromBmi(24.7, 30, 'male')).toBeCloseTo(20.2, 0));
  it('mulher tem mais gordura que homem com o mesmo IMC', () => expect(estimateBodyFatFromBmi(22, 30, 'female')).toBeGreaterThan(estimateBodyFatFromBmi(22, 30, 'male')));
  it('limites 3–60 %', () => { expect(estimateBodyFatFromBmi(10, 20, 'male')).toBe(3); expect(estimateBodyFatFromBmi(80, 60, 'female')).toBe(60); });
  it('Navy: homem 180 cm, pescoço 38, cintura 85 ≈ 14–16 %', () => {
    const v = estimateBodyFatNavy({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })!;
    expect(v).toBeGreaterThan(12); expect(v).toBeLessThan(18);
  });
  it('Navy mulher exige anca; dados incoerentes → null', () => {
    expect(estimateBodyFatNavy({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 72 })).toBeNull();
    expect(estimateBodyFatNavy({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 72, hipCm: 98 })).toBeGreaterThan(15);
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 180, neckCm: 50, waistCm: 40 })).toBeNull();
  });
  it('massa magra e muscular', () => { expect(leanMass(80, 20)).toBe(64); expect(estimateMuscleMass(80, 20)).toBe(32); });
});

describe('validação e métricas derivadas', () => {
  it('validação', () => {
    expect(validateMeasurement({})).toMatch(/pelo menos/);
    expect(validateMeasurement({ weight: 5 })).toMatch(/intervalo/);
    expect(validateMeasurement({ weight: 80, waist: 85 })).toBeNull();
  });
  const p = { sex: 'male' as const, age: 30, heightCm: 180 };
  it('IMC automático; gordura e músculo estimados são marcados', () => {
    const d = deriveMetrics({ weight: 80 }, p);
    expect(d.bmi).toBe(24.7); expect(d.bodyFatSource).toBe('estimate'); expect(d.muscleSource).toBe('estimate');
  });
  it('valores medidos têm prioridade e são marcados como medidos', () => {
    const d = deriveMetrics({ weight: 80, bodyFat: 15, muscleMass: 36 }, p);
    expect(d).toMatchObject({ bodyFat: 15, bodyFatSource: 'measured', muscleMass: 36, muscleSource: 'measured' });
  });
  it('perímetros → Navy; sem perfil → só o que foi introduzido', () => {
    expect(deriveMetrics({ weight: 80, neck: 38, waist: 85 }, p).bodyFat).toBe(estimateBodyFatNavy({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 85 }));
    expect(deriveMetrics({ weight: 80 }, null)).toMatchObject({ bmi: null, bodyFat: null, muscleMass: null });
  });
});

describe('séries e gráficos', () => {
  const pts = [{ date: '2026-09-01', value: 82 }, { date: '2026-10-01', value: 81 }, { date: '2026-10-20', value: 80 }, { date: '2026-11-10', value: 79.4 }];
  const now = new Date('2026-11-15T12:00:00').getTime();
  it('filtra por janela e ordena', () => {
    expect(filterRange([...pts].reverse(), 30, now).map((x) => x.date)).toEqual(['2026-10-20', '2026-11-10']);
    expect(filterRange(pts, null, now)).toHaveLength(4);
  });
  it('layout: x proporcional ao tempo real e y invertido', () => {
    const { coords, min, max } = chartLayout(pts, 300, 100);
    expect(coords[0]!.x).toBeLessThan(coords[3]!.x);
    expect(coords[0]!.y).toBeLessThan(coords[3]!.y); // valor mais alto fica mais acima
    expect(min).toBeLessThan(79.4); expect(max).toBeGreaterThan(82);
    expect(chartLayout([], 300, 100).coords).toEqual([]);
    expect(chartLayout([pts[0]!], 300, 100).coords[0]!.x).toBe(150);
    expect(Number.isFinite(chartLayout([pts[0]!, { date: '2026-09-02', value: 82 }], 300, 100).coords[1]!.y)).toBe(true);
  });
  it('comparação mensal e tendência', () => {
    expect(monthlyComparison(pts, now)).toMatchObject({ current: 79.4, previous: 80.5, delta: -1.1 });
    expect(monthlyComparison([pts[0]!], now).delta).toBeNull();
    expect(trend(pts, 60, now)).toEqual({ from: 81, to: 79.4, delta: -1.6 });
    expect(trend(pts, 5, now)).toBeNull();
  });
});
