import { planSchedule, sanitizePrefs, type NotificationPrefs, type ScheduledItem } from '@gym/shared';
import { getDb } from '../../database/db';
import { kvGet, kvSet } from '../../database/kv';
import { getPlan, listPlans } from '../workouts/plansRepo';

const key = (u: string) => `notif.prefs.${u}`;
export async function getPrefs(userId: string): Promise<NotificationPrefs> { const v = await kvGet(key(userId)); return sanitizePrefs(v ? JSON.parse(v) : null); }
export async function savePrefs(userId: string, p: NotificationPrefs): Promise<NotificationPrefs> { const clean = sanitizePrefs(p); await kvSet(key(userId), JSON.stringify(clean)); return clean; }

/** Lembretes a agendar agora, a partir das preferências, do plano ativo e do último treino. */
export async function buildReminders(userId: string, now = Date.now()): Promise<ScheduledItem[]> {
  const prefs = await getPrefs(userId);
  const plans = await listPlans(userId);
  const active = plans.find((p) => p.isActive) ?? plans[0];
  const plan = active ? await getPlan(active.id) : null;
  const db = await getDb();
  const last = await db.getFirstAsync<{ completed_at: number }>("SELECT completed_at FROM workout_sessions WHERE user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1", userId);
  return planSchedule(prefs, { planDays: plan?.days.map((d) => ({ dayOfWeek: d.dayOfWeek, name: d.name })) ?? [], lastWorkoutAt: last?.completed_at ?? null, now });
}
