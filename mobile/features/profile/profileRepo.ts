import type { BodyInfo, TrainingLevel } from '@gym/shared';
import { getDb } from '../../database/db';
import { kvGet, kvSet } from '../../database/kv';
import { getProfile, saveProfile } from '../nutrition/nutritionRepo';
import { enqueueProfile } from './profileSync';
import type { Profile } from '../nutrition/types';

const levelKey = (u: string) => `training.level.${u}`;
export async function getLevel(userId: string): Promise<TrainingLevel> { return ((await kvGet(levelKey(userId))) as TrainingLevel | null) ?? 'novice'; }
export async function setLevel(userId: string, l: TrainingLevel) { await kvSet(levelKey(userId), l); await enqueueProfile(userId); }

/** Peso mais recente registado (prevalece sobre o do perfil: "o peso atual alimenta os cálculos"). */
export async function latestWeight(userId: string): Promise<number | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ weight: number }>('SELECT weight FROM body_measurements WHERE user_id = ? AND deleted_at IS NULL AND weight IS NOT NULL ORDER BY date DESC LIMIT 1', userId);
  return r?.weight ?? null;
}

/** Dados corporais para cálculos (sexo, idade, altura, peso atual, nível). null se o perfil ainda não foi preenchido. */
export async function getBodyInfo(userId: string): Promise<BodyInfo | null> {
  const p = await getProfile(userId);
  if (!p) return null;
  return { sex: p.sex, age: p.age, heightCm: p.heightCm, weightKg: (await latestWeight(userId)) ?? p.weightKg, level: await getLevel(userId) };
}

const DEFAULTS: Pick<Profile, 'activity' | 'goal'> = { activity: 'moderate', goal: 'maintenance' };
/** Guarda o essencial do perfil, preservando atividade/objetivo nutricional se já existirem. */
export async function saveBasics(userId: string, b: { sex: Profile['sex']; age: number; heightCm: number; weightKg?: number }) {
  const cur = await getProfile(userId);
  await saveProfile(userId, { ...DEFAULTS, ...cur, sex: b.sex, age: b.age, heightCm: b.heightCm, weightKg: b.weightKg ?? cur?.weightKg ?? 70 });
}
export async function syncProfileWeight(userId: string) {
  const w = await latestWeight(userId); const cur = await getProfile(userId);
  if (w && cur && cur.weightKg !== w) await saveProfile(userId, { ...cur, weightKg: w });
}
