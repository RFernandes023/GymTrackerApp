import { SYNC_ENTITIES, type PullResponse, type PushResult, type SyncChange, type SyncEntity } from '@gym/shared';
import { getDb } from '../../database/db';
import { kvGet, kvSet } from '../../database/kv';
import { uuid } from '../../utils/uuid';
import { NetworkError, ApiError } from '../../services/api';
import { applyRemote } from './appliers';

export interface SyncApi {
  push(changes: SyncChange[]): Promise<{ results: PushResult[] }>;
  pull(cursor: number, limit: number): Promise<PullResponse>;
}
export interface SyncOutcome { pushed: number; pulled: number; conflicts: number; failedApply: number; error: 'offline' | 'auth' | 'server' | null }

const BATCH = 50, PAGE = 100, MAX_ATTEMPTS = 6;
const cursorKey = (u: string) => `sync.cursor.${u}`;

async function stateVersion(userId: string, entity: string, id: string) {
  const db = await getDb();
  return (await db.getFirstAsync<{ server_version: number }>('SELECT server_version FROM sync_state WHERE user_id = ? AND entity = ? AND entity_id = ?', userId, entity, id))?.server_version ?? 0;
}
async function setStateVersion(userId: string, entity: string, id: string, v: number) {
  const db = await getDb();
  await db.runAsync('INSERT INTO sync_state (user_id, entity, entity_id, server_version) VALUES (?,?,?,?) ON CONFLICT(user_id, entity, entity_id) DO UPDATE SET server_version = excluded.server_version', userId, entity, id, v);
}
const classify = (e: unknown): SyncOutcome['error'] => (e instanceof NetworkError ? 'offline' : e instanceof ApiError && e.status === 401 ? 'auth' : 'server');

/**
 * Um ciclo de sincronização: ENVIA a fila pendente (por ordem) e depois RECEBE as alterações do servidor.
 * Seguro contra falhas a meio: a fila vive no SQLite e só é limpa após confirmação do servidor; reenviar é idempotente (opId).
 */
export async function syncOnce(userId: string, api: SyncApi): Promise<SyncOutcome> {
  const out: SyncOutcome = { pushed: 0, pulled: 0, conflicts: 0, failedApply: 0, error: null };
  const db = await getDb();
  try {
    // ---------- ENVIAR ----------
    for (let guard = 0; guard < 200; guard++) {
      const rows = await db.getAllAsync<any>(`SELECT q.* FROM sync_queue q WHERE q.user_id = ? AND q.blocked = 0
        AND NOT EXISTS (SELECT 1 FROM sync_conflicts c WHERE c.user_id = q.user_id AND c.entity = q.entity AND c.entity_id = q.entity_id)
        ORDER BY q.created_at, q.rowid LIMIT ?`, userId, BATCH);
      if (rows.length === 0) break;
      const changes: SyncChange[] = [];
      for (const r of rows) {
        if (!(r.entity in SYNC_ENTITIES)) { await db.runAsync('UPDATE sync_queue SET blocked = 1, last_error = ? WHERE id = ?', 'unknown_entity', r.id); continue; }
        changes.push({ opId: r.id, entity: r.entity, entityId: r.entity_id, op: r.op, payload: r.op === 'delete' ? undefined : JSON.parse(r.payload), baseVersion: await stateVersion(userId, r.entity, r.entity_id), clientUpdatedAt: r.created_at });
      }
      if (changes.length === 0) continue;
      const { results } = await api.push(changes);
      let progress = 0;
      for (const res of results) {
        const row = rows.find((r: any) => r.id === res.opId); if (!row) continue;
        if (res.status === 'applied') { await db.runAsync('DELETE FROM sync_queue WHERE id = ?', res.opId); if (res.version !== undefined) await setStateVersion(userId, res.entity, res.entityId, res.version); out.pushed++; progress++; }
        else if (res.status === 'superseded') { // o servidor tem uma versão mais recente: adota-a
          await db.runAsync('DELETE FROM sync_queue WHERE id = ?', res.opId);
          if (res.serverDoc) { try { await applyRemote(userId, res.entity, res.entityId, res.serverDoc.data, res.serverDoc.deleted); } catch { out.failedApply++; } await setStateVersion(userId, res.entity, res.entityId, res.serverDoc.version); }
          progress++;
        } else if (res.status === 'conflict') { // plano alterado noutro dispositivo: pede resolução ao utilizador
          await db.runAsync(`INSERT INTO sync_conflicts (id, user_id, entity, entity_id, local_payload, server_payload, server_deleted, server_version, created_at) VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id, entity, entity_id) DO UPDATE SET local_payload = excluded.local_payload, server_payload = excluded.server_payload, server_deleted = excluded.server_deleted, server_version = excluded.server_version`,
            uuid(), userId, res.entity, res.entityId, row.payload, JSON.stringify(res.serverDoc?.data ?? null), res.serverDoc?.deleted ? 1 : 0, res.serverDoc?.version ?? res.version ?? 0, Date.now());
          out.conflicts++; progress++;
        } else { // rejected
          const permanent = res.reason === 'too_large' || res.reason === 'payload_required';
          await db.runAsync('UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, blocked = CASE WHEN ? = 1 OR attempts + 1 >= ? THEN 1 ELSE 0 END WHERE id = ?', res.reason ?? 'rejected', permanent ? 1 : 0, MAX_ATTEMPTS, res.opId);
        }
      }
      if (progress === 0 || rows.length < BATCH) { if (progress === 0) break; }
    }

    // ---------- RECEBER ----------
    let cursor = Number((await kvGet(cursorKey(userId))) ?? 0);
    for (let guard = 0; guard < 500; guard++) {
      const page = await api.pull(cursor, PAGE);
      for (const c of page.changes) {
        const known = await stateVersion(userId, c.entity, c.entityId);
        const pending = await db.getFirstAsync("SELECT 1 FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ? AND blocked = 0", userId, c.entity, c.entityId);
        const conflicted = await db.getFirstAsync('SELECT 1 FROM sync_conflicts WHERE user_id = ? AND entity = ? AND entity_id = ?', userId, c.entity, c.entityId);
        if (pending || conflicted) continue;              // alteração local pendente ganha até ser enviada (o conflito, se existir, aparece no envio)
        if (known === c.version) continue;                // já temos esta versão (eco das nossas escritas)
        try { await applyRemote(userId, c.entity, c.entityId, c.data, c.deleted); out.pulled++; await setStateVersion(userId, c.entity, c.entityId, c.version); }
        catch { out.failedApply++; }
      }
      cursor = page.nextCursor; await kvSet(cursorKey(userId), String(cursor));
      if (!page.hasMore) break;
    }
  } catch (e) { out.error = classify(e); }
  return out;
}

export async function syncCounts(userId: string) {
  const db = await getDb();
  const n = async (sql: string) => (await db.getFirstAsync<{ n: number }>(sql, userId))?.n ?? 0;
  return {
    pending: await n('SELECT COUNT(*) AS n FROM sync_queue WHERE user_id = ? AND blocked = 0'),
    blocked: await n('SELECT COUNT(*) AS n FROM sync_queue WHERE user_id = ? AND blocked = 1'),
    conflicts: await n('SELECT COUNT(*) AS n FROM sync_conflicts WHERE user_id = ?'),
  };
}
export const resetSyncCursor = (userId: string) => kvSet(cursorKey(userId), '0');
