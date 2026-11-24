import { getDb } from './db';

export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}
export async function kvSet(key: string, value: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    key, value, Date.now(),
  );
}
export async function kvDelete(key: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
}
