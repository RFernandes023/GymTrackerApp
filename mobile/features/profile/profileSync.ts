import { kvGet } from '../../database/kv';
import { enqueue } from '../../database/syncQueue';

export const profileKvKey = (u: string) => `nutrition.profile.${u}`;
export const levelKvKey = (u: string) => `training.level.${u}`;
export const customMealsKvKey = (u: string) => `nutrition.customMeals.${u}`;
export const profileEntityId = (u: string) => `${u}:profile`;

/** Perfil corporal, nível e refeições personalizadas: sincronizados para um dispositivo novo os receber. */
export async function enqueueProfile(userId: string) {
  const [p, l, m] = await Promise.all([kvGet(profileKvKey(userId)), kvGet(levelKvKey(userId)), kvGet(customMealsKvKey(userId))]);
  await enqueue({ userId, entity: 'user_profile', entityId: profileEntityId(userId), op: 'upsert', payload: { profile: p ? JSON.parse(p) : null, level: l, customMeals: m ? JSON.parse(m) : [] }, coalesce: true });
}
