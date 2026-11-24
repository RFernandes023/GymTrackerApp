import { calculateBmi, type Sex } from '../calc/nutrition';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** % de gordura estimada a partir do IMC (Deurenberg). Erro típico de vários pontos percentuais: é só uma estimativa. */
export function estimateBodyFatFromBmi(bmi: number, age: number, sex: Sex): number {
  const bf = 1.2 * bmi + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;
  return r1(Math.min(60, Math.max(3, bf)));
}

/** US Navy: usa perímetros (cm). Normalmente mais próximo do real do que o IMC. null se dados incoerentes. */
export function estimateBodyFatNavy(a: { sex: Sex; heightCm: number; neckCm: number; waistCm: number; hipCm?: number | null }): number | null {
  const { sex, heightCm, neckCm, waistCm } = a;
  if (!(heightCm > 0 && neckCm > 0 && waistCm > neckCm)) return null;
  let d: number;
  if (sex === 'male') d = 1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm);
  else {
    if (!a.hipCm || a.waistCm + a.hipCm <= neckCm) return null;
    d = 1.29579 - 0.35004 * Math.log10(waistCm + a.hipCm - neckCm) + 0.221 * Math.log10(heightCm);
  }
  const bf = 495 / d - 450;
  return Number.isFinite(bf) ? r1(Math.min(60, Math.max(3, bf))) : null;
}

export const leanMass = (weightKg: number, bodyFatPct: number) => r1(weightKg * (1 - bodyFatPct / 100));
/** Massa muscular esquelética ≈ 50 % da massa magra (aproximação grosseira; só uma estimativa). */
export const estimateMuscleMass = (weightKg: number, bodyFatPct: number) => r1(leanMass(weightKg, bodyFatPct) * 0.5);

export interface MeasurementInput {
  weight?: number | null; bodyFat?: number | null; muscleMass?: number | null; neck?: number | null; waist?: number | null; hip?: number | null;
  chest?: number | null; arms?: number | null; forearms?: number | null; thighs?: number | null; calves?: number | null;
}
export const MEASURE_LIMITS: Record<string, [number, number]> = {
  weight: [20, 400], bodyFat: [2, 70], muscleMass: [5, 150], neck: [15, 80], waist: [40, 250], hip: [50, 250],
  chest: [50, 250], arms: [10, 90], forearms: [10, 70], thighs: [20, 120], calves: [15, 80],
};
export function validateMeasurement(m: MeasurementInput): string | null {
  const keys = Object.keys(MEASURE_LIMITS) as (keyof MeasurementInput)[];
  if (!keys.some((k) => m[k] != null)) return 'Indica pelo menos um valor.';
  for (const k of keys) { const v = m[k]; if (v == null) continue; const [lo, hi] = MEASURE_LIMITS[k]!; if (!Number.isFinite(v) || v < lo || v > hi) return `Valor fora do intervalo plausível (${lo}–${hi}).`; }
  return null;
}

export interface Estimates { bmi: number | null; bodyFat: number | null; bodyFatSource: 'estimate' | 'measured' | null; muscleMass: number | null; muscleSource: 'estimate' | 'measured' | null }

/** IMC sempre automático; gordura/músculo medidos têm prioridade; senão estimam-se (Navy se houver perímetros, senão IMC). */
export function deriveMetrics(m: MeasurementInput, p: { sex: Sex; age: number; heightCm: number } | null): Estimates {
  const bmi = m.weight && p ? calculateBmi(m.weight, p.heightCm) : null;
  let bodyFat: number | null = null, bodyFatSource: Estimates['bodyFatSource'] = null;
  if (m.bodyFat != null) { bodyFat = m.bodyFat; bodyFatSource = 'measured'; }
  else if (p && m.weight) {
    const navy = m.neck && m.waist ? estimateBodyFatNavy({ sex: p.sex, heightCm: p.heightCm, neckCm: m.neck, waistCm: m.waist, hipCm: m.hip }) : null;
    bodyFat = navy ?? (bmi !== null ? estimateBodyFatFromBmi(bmi, p.age, p.sex) : null);
    bodyFatSource = bodyFat !== null ? 'estimate' : null;
  }
  let muscleMass: number | null = null, muscleSource: Estimates['muscleSource'] = null;
  if (m.muscleMass != null) { muscleMass = m.muscleMass; muscleSource = 'measured'; }
  else if (m.weight && bodyFat !== null) { muscleMass = estimateMuscleMass(m.weight, bodyFat); muscleSource = 'estimate'; }
  return { bmi, bodyFat, bodyFatSource, muscleMass, muscleSource };
}

export interface Point { date: string; value: number }
const DAY = 86_400_000;
const ts = (d: string) => new Date(`${d}T12:00:00`).getTime();

export function filterRange(points: Point[], days: number | null, now: number): Point[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return days === null ? sorted : sorted.filter((p) => ts(p.date) >= now - days * DAY);
}

/** Coordenadas normalizadas (x por data real, y com margem) para desenhar o gráfico. */
export function chartLayout(points: Point[], width: number, height: number, pad = 12) {
  if (points.length === 0) return { coords: [], min: 0, max: 0 };
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const margin = (max - min) * 0.1; min -= margin; max += margin;
  const t0 = ts(points[0]!.date), t1 = ts(points.at(-1)!.date), span = Math.max(1, t1 - t0);
  const coords = points.map((p) => ({
    x: pad + (points.length === 1 ? (width - 2 * pad) / 2 : ((ts(p.date) - t0) / span) * (width - 2 * pad)),
    y: pad + (1 - (p.value - min) / (max - min)) * (height - 2 * pad), value: p.value, date: p.date,
  }));
  return { coords, min: r1(min), max: r1(max) };
}

const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const monthKey = (ms: number) => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth(); };

/** Média do mês atual vs. mês anterior. */
export function monthlyComparison(points: Point[], now: number) {
  const cur = monthKey(now);
  const a = points.filter((p) => monthKey(ts(p.date)) === cur).map((p) => p.value);
  const b = points.filter((p) => monthKey(ts(p.date)) === cur - 1).map((p) => p.value);
  const current = avg(a), previous = avg(b);
  return { current, previous, delta: current !== null && previous !== null ? r1(current - previous) : null, nCurrent: a.length, nPrevious: b.length };
}

/** Variação entre o primeiro e o último registo na janela de `days` dias. */
export function trend(points: Point[], days: number, now: number) {
  const w = filterRange(points, days, now);
  if (w.length < 2) return null;
  return { from: w[0]!.value, to: w.at(-1)!.value, delta: r1(w.at(-1)!.value - w[0]!.value) };
}
