export type BaseUnit = 'g' | 'ml';
export type QuantityUnit = 'g' | 'ml' | 'serving' | 'unit';
export const QUANTITY_UNIT_LABELS: Record<QuantityUnit, string> = { g: 'g', ml: 'ml', serving: 'dose', unit: 'unidade' };

export interface Per100 {
  kcal: number; protein: number; carbs: number; fat: number;
  satFat?: number | null; sugars?: number | null; fiber?: number | null; salt?: number | null;
}
export interface FoodRef { per100: Per100; baseUnit: BaseUnit; servingSize: number | null; unitWeight: number | null }
export interface Macros { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Quantidade em g/ml base do alimento; null se a conversão não for possível (ex.: dose sem tamanho de dose definido). */
export function amountInBase(food: Pick<FoodRef, 'baseUnit' | 'servingSize' | 'unitWeight'>, quantity: number, unit: QuantityUnit): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (unit === 'g' || unit === 'ml') return unit === food.baseUnit ? quantity : null;
  if (unit === 'serving') return food.servingSize && food.servingSize > 0 ? quantity * food.servingSize : null;
  return food.unitWeight && food.unitWeight > 0 ? quantity * food.unitWeight : null;
}

/** Unidades válidas para um alimento (a UI só oferece estas). */
export function availableUnits(food: Pick<FoodRef, 'baseUnit' | 'servingSize' | 'unitWeight'>): QuantityUnit[] {
  const u: QuantityUnit[] = [food.baseUnit];
  if (food.servingSize && food.servingSize > 0) u.push('serving');
  if (food.unitWeight && food.unitWeight > 0) u.push('unit');
  return u;
}

/** Sem arredondamento: usar para valores intermédios (por unidade/dose) e arredondar só no resultado final. */
export function scalePer100Exact(per100: Per100, amount: number): Macros {
  const k = amount / 100;
  return { kcal: per100.kcal * k, protein: per100.protein * k, carbs: per100.carbs * k, fat: per100.fat * k, fiber: (per100.fiber ?? 0) * k };
}
export const roundMacros = (m: Macros): Macros => ({ kcal: round1(m.kcal), protein: round1(m.protein), carbs: round1(m.carbs), fat: round1(m.fat), fiber: round1(m.fiber) });

export function scaleNutrition(per100: Per100, amount: number): Macros {
  const k = amount / 100;
  return { kcal: round1(per100.kcal * k), protein: round1(per100.protein * k), carbs: round1(per100.carbs * k), fat: round1(per100.fat * k), fiber: round1((per100.fiber ?? 0) * k) };
}

export function sumMacros(list: Macros[]): Macros {
  const t = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat, fiber: a.fiber + m.fiber }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  return { kcal: round1(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), fiber: round1(t.fiber) };
}

export const energyFromMacros = (p: number, c: number, f: number) => Math.round(4 * p + 4 * c + 9 * f);

/** Validação de valores por 100 g/ml. `errors` bloqueiam; `warnings` pedem confirmação. */
export function validatePer100(v: Per100): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const nums: [string, number | null | undefined][] = [['calorias', v.kcal], ['proteínas', v.protein], ['hidratos', v.carbs], ['gorduras', v.fat], ['saturados', v.satFat], ['açúcares', v.sugars], ['fibra', v.fiber], ['sal', v.salt]];
  for (const [n, x] of nums) if (x != null && (!Number.isFinite(x) || x < 0)) errors.push(`Valor inválido em ${n}.`);
  if (errors.length) return { errors, warnings };
  if (v.kcal > 900) errors.push('Mais de 900 kcal por 100 g/ml não é plausível.');
  if (v.protein + v.carbs + v.fat > 100.5) errors.push('Proteínas + hidratos + gorduras excedem 100 g por 100 g/ml.');
  if (v.satFat != null && v.satFat > v.fat + 0.05) warnings.push('Gorduras saturadas superiores ao total de gorduras.');
  if (v.sugars != null && v.sugars > v.carbs + 0.05) warnings.push('Açúcares superiores ao total de hidratos.');
  const est = energyFromMacros(v.protein, v.carbs, v.fat);
  if (Math.abs(v.kcal - est) > 30 && Math.abs(v.kcal - est) / Math.max(est, 1) > 0.25) warnings.push(`As calorias (${Math.round(v.kcal)}) diferem do estimado pelos macros (${est}). Confirma os valores.`);
  return { errors, warnings };
}
