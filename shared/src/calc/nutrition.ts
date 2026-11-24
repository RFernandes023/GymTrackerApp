/** Todos os resultados são ESTIMATIVAS e devem ser apresentados como tal na UI. */
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';
export type Goal = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, athlete: 1.9,
};
export const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  fat_loss: -0.2, maintenance: 0, muscle_gain: 0.1, recomposition: -0.05,
};
const PROTEIN_G_PER_KG: Record<Goal, number> = {
  fat_loss: 2.2, maintenance: 1.8, muscle_gain: 2.0, recomposition: 2.2,
};

export interface BodyProfile { sex: Sex; age: number; heightCm: number; weightKg: number }

function assertPositive(name: string, v: number) {
  if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} inválido: ${v}`);
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  assertPositive('peso', weightKg); assertPositive('altura', heightCm);
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** Mifflin-St Jeor (kcal/dia). */
export function calculateBmr(p: BodyProfile): number {
  assertPositive('idade', p.age); assertPositive('altura', p.heightCm); assertPositive('peso', p.weightKg);
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(base + (p.sex === 'male' ? 5 : -161));
}

export function calculateTdee(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_FACTORS[activity]);
}

export interface MacroTargets { calories: number; protein: number; carbs: number; fat: number }

export function estimateTargets(p: BodyProfile, activity: ActivityLevel, goal: Goal): MacroTargets {
  const tdee = calculateTdee(calculateBmr(p), activity);
  const calories = Math.round(tdee * (1 + GOAL_CALORIE_ADJUSTMENT[goal]));
  const protein = Math.round(PROTEIN_G_PER_KG[goal] * p.weightKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}
