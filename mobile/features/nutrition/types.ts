import type { BaseUnit, Per100 } from '@gym/shared';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'afternoon_snack', 'snack'] as const;
export const MEAL_LABELS: Record<string, string> = { breakfast: 'Pequeno-almoço', lunch: 'Almoço', dinner: 'Jantar', afternoon_snack: 'Lanche', snack: 'Snacks' };
export const mealLabel = (m: string) => MEAL_LABELS[m] ?? m;

export interface FoodRecord {
  id: string; name: string; brand: string | null; barcode: string | null; source: 'openfoodfacts' | 'custom' | 'label_ocr';
  baseUnit: BaseUnit; per100: Per100; servingSize: number | null; servingLabel: string | null; unitWeight: number | null;
  isFavorite: boolean; lastUsedAt: number | null;
}

export interface Entry {
  id: string; date: string; meal: string; foodId: string | null; recipeId: string | null; name: string;
  quantity: number; unit: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number; createdAt: number;
  /** Para reescalar ao editar (necessário ao sincronizar entre dispositivos). */
  amount?: number | null; perUnit?: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
}
export interface Goal { calories: number; protein: number; carbs: number; fat: number; startDate: string }
export interface Profile { sex: 'male' | 'female'; age: number; heightCm: number; weightKg: number; activity: 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete'; goal: 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition' }
