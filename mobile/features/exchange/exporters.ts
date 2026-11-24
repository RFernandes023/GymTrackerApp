import { PLAN_SCHEMA_VERSION, buildPlanJson, toDateKey, type ExportablePlan } from '@gym/shared';
import { getDb } from '../../database/db';
import { getExercise } from '../workouts/exercisesRepo';
import { getPlan, listPlans } from '../workouts/plansRepo';
import { getSession, listHistory } from '../workouts/sessionsRepo';

const header = (type: string) => ({ schemaVersion: PLAN_SCHEMA_VERSION, type, exportedAt: new Date().toISOString(), app: 'gym-nutrition-tracker' });

/** Um plano no formato oficial (pode ser colado de volta em Importar plano). */
export async function exportPlan(userId: string, planId: string) {
  const plan = await getPlan(planId); if (!plan || !(await listPlans(userId)).some((p) => p.id === planId)) throw new Error('Plano não encontrado.');
  const days: ExportablePlan['days'] = [];
  for (const d of plan.days) {
    const exercises: ExportablePlan['days'][number]['exercises'] = [];
    for (const e of d.exercises) {
      const lib = await getExercise(e.exerciseId);
      exercises.push({ namePt: lib?.namePt ?? (lib ? null : e.name), nameEn: lib?.nameEn ?? e.name, primary: lib?.primary ?? [], secondary: lib?.secondary ?? [], equipment: lib?.equipment ?? 'other',
        weightIncrement: e.weightIncrement, goal: e.goal, notes: e.notes, supersetGroup: e.supersetGroup ? `ss-${[...new Set(d.exercises.map((x) => x.supersetGroup).filter(Boolean))].indexOf(e.supersetGroup) + 1}` : null,
        sets: e.sets.map((s) => ({ type: s.type, repMin: s.repMin, repMax: s.repMax, weight: s.weight, restSeconds: s.restSeconds, rir: s.rir })) });
    }
    days.push({ name: d.name, dayOfWeek: d.dayOfWeek, exercises });
  }
  return buildPlanJson({ name: plan.name, description: plan.description, goal: plan.goal, days });
}

export async function exportAllPlans(userId: string) {
  const plans = [];
  for (const p of await listPlans(userId)) plans.push(await exportPlan(userId, p.id));
  return { ...header('workout_plans'), plans };
}

export async function exportCustomExercises(userId: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM exercises WHERE user_id = ? AND is_custom = 1 AND deleted_at IS NULL ORDER BY name_en', userId);
  return { ...header('custom_exercises'), exercises: rows.map((r) => ({ namePt: r.name_pt, nameEn: r.name_en, altName: r.alt_name, primaryMuscles: JSON.parse(r.primary_muscles), secondaryMuscles: JSON.parse(r.secondary_muscles), equipment: r.equipment, type: r.ex_type, description: r.description, instructions: JSON.parse(r.instructions) })) };
}

export async function exportHistory(userId: string) {
  const sessions = [];
  for (const h of await listHistory(userId, 10_000)) {
    const s = await getSession(h.id); if (!s) continue;
    sessions.push({ date: toDateKey(h.completedAt), name: s.name, startedAt: new Date(s.startedAt).toISOString(), completedAt: new Date(h.completedAt).toISOString(), durationSeconds: Math.round(h.durationMs / 1000), totalVolumeKg: h.volume,
      exercises: s.exercises.map((e) => ({ name: e.name, sets: e.sets.filter((x) => x.completed).map((x) => ({ type: x.type, weightKg: x.weight, reps: x.reps, rir: x.rir, rpe: x.rpe, durationSeconds: x.durationMs ? Math.round(x.durationMs / 1000) : null, completedAt: x.completedAt ? new Date(x.completedAt).toISOString() : null })) })) });
  }
  return { ...header('workout_history'), sessions };
}

export async function exportNutrition(userId: string) {
  const db = await getDb();
  const entries = await db.getAllAsync<any>('SELECT date, meal, name, quantity, unit, kcal, protein, carbs, fat, fiber FROM nutrition_entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY date, created_at', userId);
  const goals = await db.getAllAsync<any>('SELECT start_date AS startDate, calories, protein, carbs, fat FROM nutrition_goals WHERE user_id = ? ORDER BY start_date', userId);
  const foods = await db.getAllAsync<any>('SELECT name, brand, barcode, source, base_unit AS baseUnit, kcal, protein, carbs, fat, sat_fat AS satFat, sugars, fiber, salt, serving_size AS servingSize, unit_weight AS unitWeight FROM foods WHERE user_id = ? AND deleted_at IS NULL ORDER BY name', userId);
  const recipes = [];
  for (const r of await db.getAllAsync<any>('SELECT id, name, servings, notes FROM recipes WHERE user_id = ? AND deleted_at IS NULL ORDER BY name', userId))
    recipes.push({ name: r.name, servings: r.servings, notes: r.notes, ingredients: (await db.getAllAsync<any>('SELECT name, quantity, unit, kcal, protein, carbs, fat, fiber FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position', r.id)) });
  const measurements = await db.getAllAsync<any>('SELECT date, weight, body_fat AS bodyFat, body_fat_source AS bodyFatSource, muscle_mass AS muscleMass, muscle_source AS muscleSource, bmi, neck, waist, hip, chest, arms, forearms, thighs, calves FROM body_measurements WHERE user_id = ? AND deleted_at IS NULL ORDER BY date', userId);
  return { ...header('nutrition_data'), goals, entries, foods, recipes, bodyMeasurements: measurements };
}

export type ExportKind = 'plans' | 'custom_exercises' | 'history' | 'nutrition';
export async function exportByKind(userId: string, kind: ExportKind) {
  return kind === 'plans' ? exportAllPlans(userId) : kind === 'custom_exercises' ? exportCustomExercises(userId) : kind === 'history' ? exportHistory(userId) : exportNutrition(userId);
}
