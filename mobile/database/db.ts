import * as SQLite from 'expo-sqlite';
import { migrate } from './migrations';
import { seedExercises } from './exerciseSeed';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('gymtracker.db');
      await migrate(db);
      await seedExercises(db);
      return db;
    })();
  }
  return dbPromise;
}

/** Apaga todos os dados locais (logout com limpeza / eliminação de conta). */
export async function wipeLocalData() {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM dashboard_cards; DELETE FROM sync_queue; DELETE FROM kv; DELETE FROM personal_records; DELETE FROM foods; DELETE FROM nutrition_entries; DELETE FROM nutrition_goals; DELETE FROM recipes; DELETE FROM body_measurements; DELETE FROM sync_state; DELETE FROM sync_conflicts; DELETE FROM ai_messages; DELETE FROM workout_sessions; DELETE FROM workout_plans; DELETE FROM exercises WHERE is_custom = 1;');
  });
}
