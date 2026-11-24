import type { MealItem } from './schemas';
import type { Per100 } from '../nutrition/units';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Valores por 100 g de um item estimado pela IA (para guardar como alimento e reutilizar o diário normal). */
export function mealItemToPer100(i: MealItem): Per100 {
  const k = 100 / i.grams;
  return { kcal: r1(i.kcal * k), protein: r1(i.protein * k), carbs: r1(i.carbs * k), fat: r1(i.fat * k) };
}

/** Ao corrigir as gramas, os macros escalam proporcionalmente (mantém a densidade estimada). */
export function rescaleMealItem(i: MealItem, grams: number): MealItem {
  if (!(grams > 0)) return i;
  const k = grams / i.grams;
  return { ...i, grams, kcal: r1(i.kcal * k), protein: r1(i.protein * k), carbs: r1(i.carbs * k), fat: r1(i.fat * k) };
}
