import { getDb } from '../../database/db';
import { enqueue } from '../../database/syncQueue';
import { uuid } from '../../utils/uuid';
import { defaultLayout, reconcile, type CardState } from './layout';

export async function loadLayout(userId: string): Promise<CardState[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ type: string; position: number; enabled: number }>(
    'SELECT type, position, enabled FROM dashboard_cards WHERE user_id = ? ORDER BY position', userId,
  );
  const layout = rows.length === 0
    ? defaultLayout()
    : reconcile(rows.map((r) => ({ type: r.type, position: r.position, enabled: r.enabled === 1 })));
  if (rows.length !== layout.length) await persist(userId, layout, false);
  return layout;
}

async function persist(userId: string, layout: CardState[], sync: boolean) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const c of layout) {
      await db.runAsync(
        `INSERT INTO dashboard_cards (id, user_id, type, position, enabled, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(user_id, type) DO UPDATE SET position = excluded.position, enabled = excluded.enabled, updated_at = excluded.updated_at`,
        uuid(), userId, c.type, c.position, c.enabled ? 1 : 0, now, now,
      );
    }
  });
  if (sync) await enqueue({ userId, entity: 'dashboard_layout', entityId: userId, op: 'upsert', payload: layout });
}

export const saveLayout = (userId: string, layout: CardState[]) => persist(userId, layout, true);
