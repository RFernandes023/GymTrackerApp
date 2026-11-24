import { getDb } from '../../database/db';
import { duplicatePlan, getPlan, resyncPlan } from '../workouts/plansRepo';
import { applyRemote } from './appliers';

export interface Conflict { id: string; entity: string; entityId: string; localName: string; serverName: string; serverDeleted: boolean; serverVersion: number }

export async function listConflicts(userId: string): Promise<Conflict[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM sync_conflicts WHERE user_id = ? ORDER BY created_at', userId);
  const nm = (j: string | null) => { try { return (JSON.parse(j ?? 'null')?.name as string) ?? '—'; } catch { return '—'; } };
  return rows.map((r) => ({ id: r.id, entity: r.entity, entityId: r.entity_id, localName: nm(r.local_payload), serverName: nm(r.server_payload), serverDeleted: r.server_deleted === 1, serverVersion: r.server_version }));
}

async function load(userId: string, id: string) {
  const db = await getDb();
  const c = await db.getFirstAsync<any>('SELECT * FROM sync_conflicts WHERE id = ? AND user_id = ?', id, userId);
  if (!c) throw new Error('Conflito não encontrado.');
  return c;
}
const clear = async (userId: string, c: any) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ?', userId, c.entity, c.entity_id);
  await db.runAsync('DELETE FROM sync_conflicts WHERE id = ?', c.id);
};
const setVersion = async (userId: string, c: any) => {
  const db = await getDb();
  await db.runAsync('INSERT INTO sync_state (user_id, entity, entity_id, server_version) VALUES (?,?,?,?) ON CONFLICT(user_id, entity, entity_id) DO UPDATE SET server_version = excluded.server_version', userId, c.entity, c.entity_id, c.server_version);
};

/** "Manter o meu": o plano local passa a ser a versão seguinte do servidor (substitui a do outro dispositivo). */
export async function keepMine(userId: string, id: string) {
  const c = await load(userId, id);
  await clear(userId, c); await setVersion(userId, c);
  if (await getPlan(c.entity_id)) await resyncPlan(c.entity_id); // reenvia o estado ATUAL do plano local, já com a versão certa
}

/** "Usar o do servidor": o plano local é substituído pelo do servidor. */
export async function useServer(userId: string, id: string) {
  const c = await load(userId, id);
  await applyRemote(userId, c.entity, c.entity_id, JSON.parse(c.server_payload ?? 'null'), c.server_deleted === 1);
  await clear(userId, c); await setVersion(userId, c);
}

/** "Guardar o meu como cópia": o plano local passa a um plano novo e o original fica com a versão do servidor. */
export async function keepBoth(userId: string, id: string): Promise<string | null> {
  const c = await load(userId, id);
  const copyId = (await getPlan(c.entity_id)) ? await duplicatePlan(c.entity_id) : null; // cópia do estado local atual
  await applyRemote(userId, c.entity, c.entity_id, JSON.parse(c.server_payload ?? 'null'), c.server_deleted === 1);
  await clear(userId, c); await setVersion(userId, c);
  return copyId;
}
