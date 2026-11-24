import type { SQLiteDatabase } from 'expo-sqlite';
import seed from '../assets/exercises.json';

/** Incrementar quando exercises.json mudar: reaplica o seed (não toca em exercícios personalizados). */
const SEED_VERSION = '1';

interface SeedExercise {
  id: string; en: string; pt: string | null; primary: string[]; secondary: string[];
  equipment: string; type: string | null; instructions: string[]; images: string[];
}

export async function seedExercises(db: SQLiteDatabase) {
  const cur = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = 'exercises.seed'");
  if (cur?.value === SEED_VERSION) return;
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const st = await db.prepareAsync(
      `INSERT OR REPLACE INTO exercises (id, user_id, name_pt, name_en, primary_muscles, secondary_muscles, equipment, ex_type,
        instructions, images, source, is_custom, created_at, updated_at) VALUES (?,NULL,?,?,?,?,?,?,?,?,'free-exercise-db',0,?,?)`,
    );
    try {
      for (const e of seed as SeedExercise[]) {
        await st.executeAsync(`ffd:${e.id}`, e.pt, e.en, JSON.stringify(e.primary), JSON.stringify(e.secondary),
          e.equipment, e.type, JSON.stringify(e.instructions), JSON.stringify(e.images), now, now);
      }
    } finally { await st.finalizeAsync(); }
    await db.runAsync("INSERT INTO kv (key, value, updated_at) VALUES ('exercises.seed', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", SEED_VERSION, now);
  });
}
