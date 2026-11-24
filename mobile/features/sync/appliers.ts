import type { SyncEntity } from '@gym/shared';
import { getDb } from '../../database/db';
import { kvSet } from '../../database/kv';
import { uuid } from '../../utils/uuid';
import { customMealsKvKey, levelKvKey, profileKvKey } from '../profile/profileSync';

/**
 * Aplica um documento vindo do servidor ao SQLite local, SEM enfileirar (para não ecoar de volta).
 * `data` são os mesmos DTOs que as repos enfileiram ao escrever.
 */
export async function applyRemote(userId: string, entity: SyncEntity, entityId: string, data: any, deleted: boolean): Promise<void> {
  const db = await getDb(); const now = Date.now();
  switch (entity) {
    case 'dashboard_layout': {
      if (deleted || !Array.isArray(data)) return;
      await db.withTransactionAsync(async () => {
        for (const c of data) await db.runAsync(`INSERT INTO dashboard_cards (id, user_id, type, position, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(user_id, type) DO UPDATE SET position = excluded.position, enabled = excluded.enabled, updated_at = excluded.updated_at`, uuid(), userId, c.type, c.position, c.enabled ? 1 : 0, now, now);
      });
      return;
    }
    case 'user_profile': {
      if (deleted || !data) return;
      if (data.profile) await kvSet(profileKvKey(userId), JSON.stringify(data.profile));
      if (data.level) await kvSet(levelKvKey(userId), String(data.level));
      if (Array.isArray(data.customMeals)) await kvSet(customMealsKvKey(userId), JSON.stringify(data.customMeals));
      return;
    }
    case 'custom_exercise': {
      if (deleted) { await db.runAsync('UPDATE exercises SET deleted_at = ? WHERE id = ? AND user_id = ?', now, entityId, userId); return; }
      await db.runAsync(`INSERT INTO exercises (id, user_id, name_pt, name_en, alt_name, primary_muscles, secondary_muscles, equipment, ex_type, description, instructions, images, source, is_custom, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'[]','custom',1,?,?)
        ON CONFLICT(id) DO UPDATE SET name_pt=excluded.name_pt, name_en=excluded.name_en, alt_name=excluded.alt_name, primary_muscles=excluded.primary_muscles, secondary_muscles=excluded.secondary_muscles,
          equipment=excluded.equipment, ex_type=excluded.ex_type, description=excluded.description, instructions=excluded.instructions, deleted_at=NULL, updated_at=excluded.updated_at`,
        entityId, userId, data.namePt, data.nameEn, data.altName ?? null, JSON.stringify(data.primary ?? []), JSON.stringify(data.secondary ?? []), data.equipment ?? 'other', data.type ?? null, data.description ?? null, JSON.stringify(data.instructions ?? []), now, now);
      return;
    }
    case 'workout_plan': {
      if (deleted) { await db.runAsync('UPDATE workout_plans SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?', now, now, entityId, userId); return; }
      await db.withTransactionAsync(async () => {
        const other = await db.getFirstAsync('SELECT 1 FROM workout_plans WHERE user_id = ? AND is_active = 1 AND deleted_at IS NULL AND id != ?', userId, entityId);
        const cur = await db.getFirstAsync<{ is_active: number }>('SELECT is_active FROM workout_plans WHERE id = ?', entityId);
        const active = data.isActive && !other ? 1 : cur?.is_active ?? 0; // nunca dois planos ativos
        await db.runAsync(`INSERT INTO workout_plans (id, user_id, name, description, goal, is_active, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, goal=excluded.goal, is_active=excluded.is_active, version=excluded.version, updated_at=excluded.updated_at, deleted_at=NULL`,
          entityId, userId, data.name, data.description ?? null, data.goal ?? 'hypertrophy', active, data.version ?? 1, now, data.updatedAt ?? now);
        await db.runAsync('DELETE FROM plan_days WHERE plan_id = ?', entityId); // cascata: exercícios e séries
        for (const d of data.days ?? []) {
          await db.runAsync('INSERT INTO plan_days (id, plan_id, name, day_of_week, position) VALUES (?,?,?,?,?)', d.id, entityId, d.name, d.dayOfWeek ?? null, d.position);
          for (const e of d.exercises ?? []) {
            await db.runAsync('INSERT INTO plan_exercises (id, day_id, exercise_id, position, weight_increment, rest_seconds, goal, notes, superset_group) VALUES (?,?,?,?,?,?,?,?,?)', e.id, d.id, e.exerciseId, e.position, e.weightIncrement, e.restSeconds, e.goal ?? null, e.notes ?? null, e.supersetGroup ?? null);
            for (const s of e.sets ?? []) await db.runAsync('INSERT INTO plan_sets (id, plan_exercise_id, position, set_type, rep_min, rep_max, weight, rest_seconds, rir) VALUES (?,?,?,?,?,?,?,?,?)', s.id, e.id, s.position, s.type, s.repMin, s.repMax, s.weight, s.restSeconds ?? null, s.rir ?? null);
          }
        }
      });
      return;
    }
    case 'workout_session': {
      if (deleted) { await db.runAsync('DELETE FROM personal_records WHERE session_id = ? AND user_id = ?', entityId, userId); await db.runAsync("DELETE FROM workout_sessions WHERE id = ? AND user_id = ? AND status = 'completed'", entityId, userId); return; }
      if (await db.getFirstAsync('SELECT 1 FROM workout_sessions WHERE id = ?', entityId)) return; // histórico imutável: o que já existe não é reescrito
      if (data.status !== 'completed') return;
      await db.withTransactionAsync(async () => {
        await db.runAsync(`INSERT INTO workout_sessions (id, user_id, plan_id, plan_day_id, plan_version, name, status, started_at, completed_at, duration_ms, total_volume, rest_ends_at, summary_json, created_at, updated_at)
          VALUES (?,?,?,?,NULL,?,'completed',?,?,?,?,NULL,?,?,?)`, entityId, userId, data.planId ?? null, data.planDayId ?? null, data.name, data.startedAt, data.completedAt, data.durationMs, data.totalVolume, data.summary ? JSON.stringify(data.summary) : null, now, now);
        for (const e of data.exercises ?? []) {
          await db.runAsync('INSERT INTO session_exercises (id, session_id, exercise_id, position, name, weight_increment, rest_seconds, rep_min, rep_max, superset_group, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)', e.id, entityId, e.exerciseId, e.position, e.name, e.weightIncrement, e.restSeconds, e.repMin, e.repMax, e.supersetGroup ?? null, e.notes ?? null);
          for (const s of e.sets ?? []) await db.runAsync('INSERT INTO session_sets (id, session_exercise_id, position, set_type, target_rep_min, target_rep_max, weight, reps, rir, rpe, rest_seconds, completed, started_at, completed_at, duration_ms, is_extra) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            s.id, e.id, s.position, s.type, s.targetRepMin, s.targetRepMax, s.weight, s.reps, s.rir ?? null, s.rpe ?? null, s.restSeconds, s.completed ? 1 : 0, s.startedAt ?? null, s.completedAt ?? null, s.durationMs ?? null, s.isExtra ? 1 : 0);
        }
        for (const r of data.summary?.records ?? []) { // recordes são derivados: reconstruídos a partir do sumário
          const ex = (data.exercises ?? []).find((x: any) => x.name === r.exerciseName);
          if (ex) await db.runAsync('INSERT INTO personal_records (id, user_id, exercise_id, exercise_name, kind, value, session_id, achieved_at) VALUES (?,?,?,?,?,?,?,?)', uuid(), userId, ex.exerciseId, r.exerciseName, r.kind, r.value, entityId, data.completedAt);
        }
      });
      return;
    }
    case 'food': {
      if (deleted) { await db.runAsync('UPDATE foods SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', now, now, entityId, userId); return; }
      if (data.barcode && await db.getFirstAsync('SELECT 1 FROM foods WHERE user_id = ? AND barcode = ? AND id != ? AND deleted_at IS NULL', userId, data.barcode, entityId)) return; // mesmo produto já existe localmente
      const p = data.per100;
      await db.runAsync(`INSERT INTO foods (id, user_id, name, brand, barcode, source, base_unit, kcal, protein, carbs, fat, sat_fat, sugars, fiber, salt, serving_size, serving_label, unit_weight, is_favorite, last_used_at, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, brand=excluded.brand, barcode=excluded.barcode, source=excluded.source, base_unit=excluded.base_unit, kcal=excluded.kcal, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat,
          sat_fat=excluded.sat_fat, sugars=excluded.sugars, fiber=excluded.fiber, salt=excluded.salt, serving_size=excluded.serving_size, serving_label=excluded.serving_label, unit_weight=excluded.unit_weight, is_favorite=excluded.is_favorite, deleted_at=NULL, updated_at=excluded.updated_at`,
        entityId, userId, data.name, data.brand ?? null, data.barcode ?? null, data.source, data.baseUnit, p.kcal, p.protein, p.carbs, p.fat, p.satFat ?? null, p.sugars ?? null, p.fiber ?? null, p.salt ?? null, data.servingSize ?? null, data.servingLabel ?? null, data.unitWeight ?? null, data.isFavorite ? 1 : 0, data.lastUsedAt ?? null, now, now);
      return;
    }
    case 'nutrition_entry': {
      if (deleted) { await db.runAsync('UPDATE nutrition_entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', now, now, entityId, userId); return; }
      const q = data.quantity || 1;
      const perUnit = data.perUnit ?? { kcal: data.kcal / q, protein: data.protein / q, carbs: data.carbs / q, fat: data.fat / q, fiber: (data.fiber ?? 0) / q };
      await db.runAsync(`INSERT INTO nutrition_entries (id, user_id, date, meal, food_id, recipe_id, name, quantity, unit, amount, kcal, protein, carbs, fat, fiber, per_unit, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET date=excluded.date, meal=excluded.meal, food_id=excluded.food_id, recipe_id=excluded.recipe_id, name=excluded.name, quantity=excluded.quantity, unit=excluded.unit, amount=excluded.amount,
          kcal=excluded.kcal, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat, fiber=excluded.fiber, per_unit=excluded.per_unit, deleted_at=NULL, updated_at=excluded.updated_at`,
        entityId, userId, data.date, data.meal, data.foodId ?? null, data.recipeId ?? null, data.name, data.quantity, data.unit, data.amount ?? null, data.kcal, data.protein, data.carbs, data.fat, data.fiber ?? 0, JSON.stringify(perUnit), data.createdAt ?? now, now);
      return;
    }
    case 'nutrition_goal': {
      if (deleted || !data?.startDate) return;
      await db.runAsync(`INSERT INTO nutrition_goals (id, user_id, calories, protein, carbs, fat, start_date, created_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, start_date) DO UPDATE SET calories=excluded.calories, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat`, uuid(), userId, data.calories, data.protein, data.carbs, data.fat, data.startDate, now);
      return;
    }
    case 'recipe': {
      if (deleted) { await db.runAsync('UPDATE recipes SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', now, now, entityId, userId); return; }
      await db.withTransactionAsync(async () => {
        await db.runAsync(`INSERT INTO recipes (id, user_id, name, servings, notes, is_favorite, is_meal_prep, remaining_portions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, servings=excluded.servings, notes=excluded.notes, is_favorite=excluded.is_favorite, is_meal_prep=excluded.is_meal_prep, remaining_portions=excluded.remaining_portions, deleted_at=NULL, updated_at=excluded.updated_at`,
          entityId, userId, data.name, data.servings, data.notes ?? null, data.isFavorite ? 1 : 0, data.isMealPrep ? 1 : 0, data.remainingPortions ?? null, now, now);
        await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', entityId);
        for (const [i, x] of (data.ingredients ?? []).entries()) {
          const q = x.quantity || 1;
          const perUnit = x.perUnit ?? { kcal: x.kcal / q, protein: x.protein / q, carbs: x.carbs / q, fat: x.fat / q, fiber: (x.fiber ?? 0) / q };
          await db.runAsync('INSERT INTO recipe_ingredients (id, recipe_id, food_id, name, quantity, unit, amount, kcal, protein, carbs, fat, fiber, per_unit, position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', x.id, entityId, x.foodId ?? null, x.name, x.quantity, x.unit, x.amount ?? null, x.kcal, x.protein, x.carbs, x.fat, x.fiber ?? 0, JSON.stringify(perUnit), i);
        }
      });
      return;
    }
    case 'body_measurement': {
      if (deleted) { await db.runAsync('UPDATE body_measurements SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', now, now, entityId, userId); return; }
      await db.runAsync('UPDATE body_measurements SET deleted_at = ? WHERE user_id = ? AND date = ? AND id != ? AND deleted_at IS NULL', now, userId, data.date, entityId); // 1 registo por dia: o remoto (mais recente) ganha
      await db.runAsync(`INSERT INTO body_measurements (id, user_id, date, weight, body_fat, body_fat_source, muscle_mass, muscle_source, bmi, neck, waist, hip, chest, arms, forearms, thighs, calves, custom, notes, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET date=excluded.date, weight=excluded.weight, body_fat=excluded.body_fat, body_fat_source=excluded.body_fat_source, muscle_mass=excluded.muscle_mass, muscle_source=excluded.muscle_source, bmi=excluded.bmi,
          neck=excluded.neck, waist=excluded.waist, hip=excluded.hip, chest=excluded.chest, arms=excluded.arms, forearms=excluded.forearms, thighs=excluded.thighs, calves=excluded.calves, custom=excluded.custom, notes=excluded.notes, deleted_at=NULL, updated_at=excluded.updated_at`,
        entityId, userId, data.date, data.weight ?? null, data.bodyFat ?? null, data.bodyFatSource ?? null, data.muscleMass ?? null, data.muscleSource ?? null, data.bmi ?? null, data.neck ?? null, data.waist ?? null, data.hip ?? null, data.chest ?? null, data.arms ?? null, data.forearms ?? null, data.thighs ?? null, data.calves ?? null, JSON.stringify(data.custom ?? {}), data.notes ?? null, now, now);
      return;
    }
  }
}
