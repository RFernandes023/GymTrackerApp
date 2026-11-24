import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { freshDb, type TestDb } from './testDb';

let db: TestDb;
vi.mock('../database/db', () => ({ getDb: async () => db }));
vi.mock('../utils/uuid', () => ({ uuid: () => randomUUID() }));

import { DEFAULT_PREFS } from '@gym/shared';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import { searchExercises } from '../features/workouts/exercisesRepo';
import { buildReminders, getPrefs, savePrefs } from '../features/notifications/reminders';

const A = 'user-a', B = 'user-b';
beforeEach(async () => { db = await freshDb(); });

async function planWithDays(userId = A) {
  const id = await plans.createPlan(userId, 'P'); const d0 = (await plans.getPlan(id))!.days[0]!.id;
  await plans.updateDay(id, d0, { name: 'Push', dayOfWeek: 1 }); await plans.addDay(id, 'Pull');
  const d1 = (await plans.getPlan(id))!.days[1]!.id; await plans.updateDay(id, d1, { dayOfWeek: 4 });
  for (const d of [d0, d1]) await plans.addExerciseToDay(id, d, (await searchExercises(userId, { query: 'Supino plano com barra' }))[0]!.id, { weight: 20 });
  return { id, d0 };
}

describe('lembretes a partir dos dados reais', () => {
  it('preferências: defaults, persistência por utilizador e saneamento', async () => {
    expect(await getPrefs(A)).toEqual(DEFAULT_PREFS);
    await savePrefs(A, { ...DEFAULT_PREFS, workout: { enabled: true, time: '7:00' }, foodLog: { enabled: true, times: ['99:99', '13:00'] } });
    const p = await getPrefs(A);
    expect(p.workout).toEqual({ enabled: true, time: '07:00' }); expect(p.foodLog.times).toEqual(['13:00']);
    expect(await getPrefs(B)).toEqual(DEFAULT_PREFS);
  });
  it('sem nada ativado: nenhum lembrete', async () => { await planWithDays(); expect(await buildReminders(A)).toEqual([]); });
  it('treino: um lembrete por dia do plano ativo', async () => {
    await planWithDays(); await savePrefs(A, { ...DEFAULT_PREFS, workout: { enabled: true, time: '18:00' } });
    const r = await buildReminders(A);
    expect(r.map((x) => x.id)).toEqual(['rem:workout:1', 'rem:workout:4']); expect(r[0]!.body).toContain('Push');
    expect(await buildReminders(B)).toEqual([]); // outro utilizador sem plano nem preferências
  });
  it('inatividade conta a partir do último treino concluído', async () => {
    const { id, d0 } = await planWithDays();
    await savePrefs(A, { ...DEFAULT_PREFS, inactivity: { enabled: true, days: 4 } });
    const now = Date.now();
    const sid = await sessions.startSession(A, id, d0);
    for (const s of (await sessions.getSession(sid))!.exercises[0]!.sets) await sessions.completeSet(sid, s.id);
    await sessions.finishSession(A, sid);
    const r = (await buildReminders(A, now))[0]!;
    const at = (r.trigger as { at: number }).at;
    expect(at).toBeGreaterThan(now + 3 * 86_400_000); expect(at).toBeLessThan(now + 5 * 86_400_000 + 3600_000);
  });
});
