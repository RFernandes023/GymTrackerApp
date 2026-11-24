import type { BaseUnit, Per100 } from './units';

export interface FoodDraft {
  name: string; brand: string | null; barcode: string | null; baseUnit: BaseUnit; per100: Per100;
  servingSize: number | null; servingLabel: string | null; unitWeight: number | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Converte um produto da API Open Food Facts num rascunho de alimento. null = dados insuficientes (cai para criação manual). */
export function mapOffProduct(p: any): FoodDraft | null {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.product_name_pt || p.product_name || p.generic_name_pt || p.generic_name || '').trim();
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null) { const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']); if (kj !== null) kcal = Math.round(kj / 4.184); }
  const protein = num(n.proteins_100g), carbs = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  if (!name || kcal === null || (protein === null && carbs === null && fat === null)) return null;
  const sizeText = String(p.serving_size ?? p.quantity ?? '').toLowerCase();
  const unitField = String(p.product_quantity_unit ?? '').toLowerCase();
  const baseUnit: BaseUnit = unitField === 'ml' || /\d\s*(ml|cl|dl)\b|\d\s*l\b/.test(sizeText) ? 'ml' : 'g';
  const serving = num(p.serving_quantity);
  return {
    name, brand: String(p.brands ?? '').split(',')[0]?.trim() || null, barcode: p.code ? String(p.code) : null, baseUnit,
    per100: { kcal, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0, satFat: num(n['saturated-fat_100g']), sugars: num(n.sugars_100g), fiber: num(n.fiber_100g), salt: num(n.salt_100g) },
    servingSize: serving && serving > 0 ? serving : null, servingLabel: p.serving_size ? String(p.serving_size) : null, unitWeight: null,
  };
}
