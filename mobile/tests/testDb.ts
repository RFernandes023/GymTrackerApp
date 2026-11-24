import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrations';
import { seedExercises } from '../database/exerciseSeed';

/** Adaptador mínimo da API do expo-sqlite sobre node:sqlite — permite testar SQL, migrações e repositórios em Node. */
export class TestDb {
  raw = new DatabaseSync(':memory:');
  private args = (a: unknown[]) => (a.length === 1 && Array.isArray(a[0]) ? (a[0] as unknown[]) : a).map((v) => (v === undefined ? null : v)) as any[];
  async execAsync(sql: string) { this.raw.exec(sql); }
  async runAsync(sql: string, ...a: unknown[]) { this.raw.prepare(sql).run(...this.args(a)); }
  async getFirstAsync<T>(sql: string, ...a: unknown[]): Promise<T | null> { return (this.raw.prepare(sql).get(...this.args(a)) as T) ?? null; }
  async getAllAsync<T>(sql: string, ...a: unknown[]): Promise<T[]> { return this.raw.prepare(sql).all(...this.args(a)) as T[]; }
  async withTransactionAsync(fn: () => Promise<void>) {
    this.raw.exec('BEGIN');
    try { await fn(); this.raw.exec('COMMIT'); } catch (e) { this.raw.exec('ROLLBACK'); throw e; }
  }
  async prepareAsync(sql: string) {
    const st = this.raw.prepare(sql);
    return { executeAsync: async (...a: unknown[]) => { st.run(...this.args(a)); }, finalizeAsync: async () => {} };
  }
}

export async function freshDb() {
  const db = new TestDb();
  await migrate(db as any);
  await seedExercises(db as any);
  return db;
}
