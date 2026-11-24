import { uuid } from '../utils/uuid';
import { getDb } from './db';

const listeners = new Set<() => void>();
/** Avisa quando há uma nova alteração para sincronizar (o agendador faz debounce). */
export const onEnqueue = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export interface EnqueueInput { userId: string; entity: string; entityId: string; op: 'upsert' | 'delete'; payload: unknown }

/** Regista uma alteração local a enviar ao backend. O envio (sync incremental) é implementado na Fase 7. */
export async function enqueue(i: EnqueueInput & { coalesce?: boolean }) {
  const db = await getDb();
  // Coalescer: só interessa enviar o estado mais recente da entidade (ainda não tentado).
  if (i.coalesce) await db.runAsync("DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ? AND op = 'upsert' AND attempts = 0 AND blocked = 0", i.userId, i.entity, i.entityId);
  await db.runAsync(
    'INSERT INTO sync_queue (id, user_id, entity, entity_id, op, payload, created_at) VALUES (?,?,?,?,?,?,?)',
    uuid(), i.userId, i.entity, i.entityId, i.op, JSON.stringify(i.payload), Date.now(),
  );
  for (const l of listeners) l();
}

export async function pendingCount(userId: string): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_queue WHERE user_id = ?', userId);
  return r?.n ?? 0;
}
