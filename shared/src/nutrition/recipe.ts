import { round1, sumMacros, type Macros } from './units';

export const recipeTotals = (ingredients: Macros[]) => sumMacros(ingredients);

export function perServing(totals: Macros, servings: number): Macros {
  if (!(servings > 0)) throw new RangeError('servings inválido');
  const f = (n: number) => round1(n / servings);
  return { kcal: f(totals.kcal), protein: f(totals.protein), carbs: f(totals.carbs), fat: f(totals.fat), fiber: f(totals.fiber) };
}
export const scaleMacrosExact = (m: Macros, factor: number): Macros => ({ kcal: m.kcal * factor, protein: m.protein * factor, carbs: m.carbs * factor, fat: m.fat * factor, fiber: m.fiber * factor });
export function scaleMacros(m: Macros, factor: number): Macros {
  return { kcal: round1(m.kcal * factor), protein: round1(m.protein * factor), carbs: round1(m.carbs * factor), fat: round1(m.fat * factor), fiber: round1(m.fiber * factor) };
}
