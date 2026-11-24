import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestDb, freshDb } from './testDb';

let db: TestDb;
vi.mock('../database/db', () => ({ getDb: async () => db }));
vi.mock('../utils/uuid', () => ({ uuid: () => randomUUID() }));
vi.mock('../services/tokenStorage', () => ({ loadTokens: async () => null, saveTokens: async () => {}, clearTokens: async () => {} }));

import { MemoryStore } from '../../backend/src/database/memoryStore';
import { NetworkError } from '../services/api';
import { syncCounts, syncOnce, type SyncApi } from '../features/sync/engine';
import { applyRemote } from '../features/sync/appliers';
import { keepBoth, keepMine, listConflicts, useServer } from '../features/sync/conflicts';
import { searchExercises } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import * as foods from '../features/nutrition/foodsRepo';
import * as nut from '../features/nutrition/nutritionRepo';
import * as meas from '../features/progress/measurementsRepo';
import { getBodyInfo, saveBasics } from '../features/profile/profileRepo';

const U = 'user-1', OTHER = 'user-2';
let server: MemoryStore; let d1: TestDb, d2: TestDb, d3: TestDb;
let offline = false;

const apiFor = (userId: string): SyncApi => ({
  async push(changes) { if (offline) throw new NetworkError('offline'); const results = []; for (const c of changes) results.push(await server.syncPush(userId, c)); return { results }; },
  async pull(cursor, limit) { if (offline) throw new NetworkError('offline'); return server.syncPull(userId, cursor, limit); },
});
const on = async <T>(d: TestDb, fn: () => Promise<T>) => { db = d; return fn(); };
const sync = (d: TestDb, userId = U, api = apiFor(userId)) => on(d, () => syncOnce(userId, api));
const tick = () => new Promise((r) => setTimeout(r, 5));
const find = async (q: string) => (await searchExercises(U, { query: q }))[0]!;

beforeEach(async () => { server = new MemoryStore(); offline = false; d1 = await freshDb(); d2 = await freshDb(); d3 = await freshDb(); db = d1; });

async function seedDevice1() {
  return on(d1, async () => {
    await saveBasics(U, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
    const planId = await plans.createPlan(U, 'Upper', undefined, 'strength');
    const dayId = (await plans.getPlan(planId))!.days[0]!.id;
    await plans.addExerciseToDay(planId, dayId, (await find('Supino plano com barra')).id, { weight: 60, sets: 3, dropSets: 1 });
    const sid = await sessions.startSession(U, planId, dayId);
    for (const s of (await sessions.getSession(sid))!.exercises[0]!.sets) await sessions.completeSet(sid, s.id);
    await sessions.finishSession(U, sid);
    const food = await foods.saveFood(U, { name: 'Leite', brand: 'M', barcode: '5601234567890', baseUnit: 'ml', per100: { kcal: 46, protein: 3.3, carbs: 4.8, fat: 1.6 }, servingSize: 250, servingLabel: '250 ml', unitWeight: null, source: 'openfoodfacts' });
    const entry = await nut.logFood(U, { date: '2026-11-15', meal: 'breakfast', food, quantity: 1, unit: 'serving' });
    await nut.setGoal(U, { calories: 2500, protein: 150, carbs: 280, fat: 70 }, '2026-01-01');
    await meas.saveMeasurement(U, { date: '2026-11-14', weight: 80, waist: 85 });
    await nut.addCustomMeal(U, 'Pré-treino');
    return { planId, dayId, sid, food, entry };
  });
}

describe('dois dispositivos', () => {
  it('tudo o que foi criado no dispositivo 1 chega ao 2 (planos, sessões, alimentos, diário, objetivos, medidas, perfil)', async () => {
    const x = await seedDevice1();
    const o1 = await sync(d1);
    expect(o1).toMatchObject({ error: null, conflicts: 0 }); expect(o1.pushed).toBeGreaterThan(5);
    expect(await on(d1, () => syncCounts(U))).toMatchObject({ pending: 0, conflicts: 0 });
    const o2 = await sync(d2);
    expect(o2).toMatchObject({ error: null, failedApply: 0 }); expect(o2.pulled).toBeGreaterThan(5);
    await on(d2, async () => {
      const p = (await plans.getPlan(x.planId))!;
      expect(p).toMatchObject({ name: 'Upper', goal: 'strength' });
      expect(p.days[0]!.exercises[0]!.name).toBe('Supino plano com barra');
      expect(p.days[0]!.exercises[0]!.sets.map((s) => s.type)).toEqual(['working', 'working', 'working', 'drop']);
      const h = await sessions.listHistory(U); expect(h.map((s) => s.id)).toEqual([x.sid]);
      const s = (await sessions.getSession(x.sid))!; expect(s.status).toBe('completed'); expect(s.exercises[0]!.sets.every((v) => v.completed)).toBe(true);
      expect((await foods.findByBarcode(U, '5601234567890'))!.name).toBe('Leite');
      const day = await nut.getDay(U, '2026-11-15'); expect(day.totals.kcal).toBe(115); expect(day.goal!.calories).toBe(2500);
      expect((await meas.listMeasurements(U)).map((m) => m.weight)).toEqual([80]);
      expect((await getBodyInfo(U))!.heightCm).toBe(180);
      expect(await nut.getCustomMeals(U)).toEqual(['Pré-treino']);
      // as entradas sincronizadas continuam editáveis com precisão (per_unit chegou)
      const e = await nut.updateEntry(U, x.entry.id, { quantity: 2 }); expect(e.kcal).toBe(230);
    });
  });

  it('segunda sincronização é inócua (sem eco nem duplicados)', async () => {
    await seedDevice1(); await sync(d1); await sync(d2);
    expect(await sync(d1)).toMatchObject({ pushed: 0, pulled: 0, error: null });
    expect(await sync(d2)).toMatchObject({ pushed: 0, pulled: 0, error: null });
    await on(d2, async () => { expect(await plans.listPlans(U)).toHaveLength(1); expect(await sessions.listHistory(U)).toHaveLength(1); });
  });

  it('edições (última escrita ganha) e remoções propagam-se nos dois sentidos', async () => {
    const x = await seedDevice1(); await sync(d1); await sync(d2);
    await on(d2, async () => { await foods.setFavorite(U, x.food.id, true); await nut.deleteEntry(U, x.entry.id); });
    await tick(); await sync(d2); await sync(d1);
    await on(d1, async () => { expect((await foods.getFood(U, x.food.id))!.isFavorite).toBe(true); expect((await nut.getDay(U, '2026-11-15')).entries).toHaveLength(0); });
    // e de volta
    await on(d1, () => foods.saveFood(U, { ...x.food, name: 'Leite meio-gordo', id: x.food.id, source: 'openfoodfacts' }));
    await tick(); await sync(d1); await sync(d2);
    await on(d2, async () => expect((await foods.getFood(U, x.food.id))!.name).toBe('Leite meio-gordo'));
  });

  it('offline: nada se perde; a fila persiste e envia quando há rede', async () => {
    await seedDevice1(); offline = true;
    const o = await sync(d1);
    expect(o.error).toBe('offline'); const c = await on(d1, () => syncCounts(U)); expect(c.pending).toBeGreaterThan(5);
    await on(d1, async () => { const f = await foods.saveFood(U, { name: 'Offline', brand: null, barcode: null, baseUnit: 'g', per100: { kcal: 1, protein: 1, carbs: 1, fat: 1 }, servingSize: null, servingLabel: null, unitWeight: null, source: 'custom' }); void f; });
    expect((await on(d1, () => syncCounts(U))).pending).toBeGreaterThan(c.pending);
    offline = false;
    expect(await sync(d1)).toMatchObject({ error: null }); expect((await on(d1, () => syncCounts(U))).pending).toBe(0);
    await sync(d2); await on(d2, async () => expect((await foods.searchFoods(U, { query: 'Offline' })).length).toBe(1));
  });

  it('falha a meio do envio: o que não foi confirmado fica na fila e reenvia sem duplicar', async () => {
    await seedDevice1();
    let calls = 0; const flaky: SyncApi = { async push(ch) { calls++; if (calls === 1) { await server.syncPush(U, ch[0]!); throw new NetworkError('cortou depois de aplicar 1'); } return { results: await Promise.all(ch.map((c) => server.syncPush(U, c))) }; }, pull: (c, l) => server.syncPull(U, c, l) };
    expect((await sync(d1, U, flaky)).error).toBe('offline');
    expect(await sync(d1)).toMatchObject({ error: null });
    expect((await on(d1, () => syncCounts(U))).pending).toBe(0);
    await sync(d2); await on(d2, async () => { expect(await plans.listPlans(U)).toHaveLength(1); expect(await sessions.listHistory(U)).toHaveLength(1); });
  });

  it('isolamento: outro utilizador não recebe nada', async () => {
    await seedDevice1(); await sync(d1);
    const o = await sync(d3, OTHER);
    expect(o.pulled).toBe(0); await on(d3, async () => { expect(await plans.listPlans(OTHER)).toHaveLength(0); expect(await sessions.listHistory(OTHER)).toHaveLength(0); });
  });
});

describe('conflitos de planos', () => {
  async function conflict() {
    const x = await seedDevice1(); await sync(d1); await sync(d2);
    await on(d1, () => plans.updatePlan(x.planId, { name: 'Do dispositivo 1' }));
    await on(d2, () => plans.updatePlan(x.planId, { name: 'Do dispositivo 2' }));
    await sync(d1);                          // 1 chega primeiro
    const o = await sync(d2);                // 2 está desatualizado
    return { ...x, o };
  }
  it('deteta a versão concorrente e NÃO sobrescreve nenhum dos lados', async () => {
    const x = await conflict();
    expect(x.o.conflicts).toBe(1);
    await on(d2, async () => {
      const cs = await listConflicts(U); expect(cs).toHaveLength(1); expect(cs[0]).toMatchObject({ entity: 'workout_plan', localName: 'Do dispositivo 2', serverName: 'Do dispositivo 1' });
      expect((await plans.getPlan(x.planId))!.name).toBe('Do dispositivo 2');       // local intacto
      expect((await syncCounts(U)).conflicts).toBe(1);
    });
    expect(await sync(d2)).toMatchObject({ conflicts: 0 });                         // enquanto não resolver, não volta a enviar
    expect((await server.syncPull(U, 0, 500)).changes.find((c) => c.entityId === x.planId)!.data).toMatchObject({ name: 'Do dispositivo 1' });
  });
  it('"manter o meu" → servidor e outro dispositivo passam a ter a minha versão', async () => {
    const x = await conflict();
    await on(d2, async () => { await keepMine(U, (await listConflicts(U))[0]!.id); });
    expect(await sync(d2)).toMatchObject({ error: null, conflicts: 0 });
    await sync(d1); await on(d1, async () => expect((await plans.getPlan(x.planId))!.name).toBe('Do dispositivo 2'));
    expect((await on(d2, () => listConflicts(U)))).toHaveLength(0);
  });
  it('"usar o do servidor" → o meu plano é substituído e a fila limpa', async () => {
    const x = await conflict();
    await on(d2, async () => { await useServer(U, (await listConflicts(U))[0]!.id); expect((await plans.getPlan(x.planId))!.name).toBe('Do dispositivo 1'); });
    expect(await sync(d2)).toMatchObject({ pushed: 0, conflicts: 0 });
    expect((await on(d2, () => syncCounts(U)))).toMatchObject({ pending: 0, conflicts: 0 });
  });
  it('"guardar o meu como cópia" → ficam os dois planos, em todos os dispositivos', async () => {
    const x = await conflict();
    const copyId = await on(d2, async () => keepBoth(U, (await listConflicts(U))[0]!.id));
    expect(copyId).toBeTruthy();
    await sync(d2); await sync(d1);
    for (const d of [d1, d2]) await on(d, async () => {
      const names = (await plans.listPlans(U)).map((p) => p.name).sort();
      expect(names).toEqual(['Do dispositivo 1', 'Do dispositivo 2 (cópia)']);
      expect((await plans.getPlan(x.planId))!.name).toBe('Do dispositivo 1');
    });
  });
});

describe('robustez', () => {
  it('alteração local pendente não é sobrescrita por uma remota que chega entretanto', async () => {
    const x = await seedDevice1(); await sync(d1); await sync(d2);
    await on(d2, () => foods.setFavorite(U, x.food.id, true));            // pendente no 2
    const stuck: SyncApi = { async push(ch) { return { results: ch.map((c) => ({ opId: c.opId, entity: c.entity, entityId: c.entityId, status: 'rejected' as const, reason: 'busy' })) }; }, pull: (c, l) => server.syncPull(U, c, l) };
    await on(d1, () => foods.saveFood(U, { ...x.food, id: x.food.id, name: 'Remoto', source: 'openfoodfacts' })); await tick(); await sync(d1);
    await sync(d2, U, stuck);
    await on(d2, async () => { const f = (await foods.getFood(U, x.food.id))!; expect(f.isFavorite).toBe(true); expect(f.name).toBe('Leite'); });
  });
  it('rejeição permanente bloqueia a linha (não repete para sempre) e é contabilizada', async () => {
    await on(d1, () => nut.setGoal(U, { calories: 2000, protein: 100, carbs: 200, fat: 60 }, '2026-02-02'));
    const rej: SyncApi = { push: async (ch) => ({ results: ch.map((c) => ({ opId: c.opId, entity: c.entity, entityId: c.entityId, status: 'rejected' as const, reason: 'too_large' })) }), pull: (c, l) => server.syncPull(U, c, l) };
    await sync(d1, U, rej);
    expect(await on(d1, () => syncCounts(U))).toMatchObject({ pending: 0, blocked: 1 });
    expect((await sync(d1)).pushed).toBe(0);
  });
  it('histórico é imutável: aplicar uma sessão já existente não a reescreve', async () => {
    const x = await seedDevice1();
    await on(d1, async () => {
      const before = JSON.stringify(await sessions.getSession(x.sid));
      const evil = { ...(await sessions.getSession(x.sid))!, name: 'ADULTERADA', totalVolume: 1 };
      await applyRemote(U, 'workout_session', x.sid, evil, false);
      expect(JSON.stringify(await sessions.getSession(x.sid))).toBe(before);
    });
  });
  it('sessões remotas trazem os recordes (reconstruídos do sumário)', async () => {
    const x = await seedDevice1();
    await on(d1, async () => { // 2.ª sessão com carga maior → recorde
      const sid = await sessions.startSession(U, x.planId, x.dayId);
      for (const s of (await sessions.getSession(sid))!.exercises[0]!.sets) { await sessions.updateSet(s.id, { weight: 80, reps: 8 }); await sessions.completeSet(sid, s.id); }
      expect((await sessions.finishSession(U, sid)).records.length).toBeGreaterThan(0);
    });
    await sync(d1); await sync(d2);
    await on(d2, async () => { expect((await db.getAllAsync('SELECT * FROM personal_records WHERE user_id = ?', U)).length).toBeGreaterThan(0); });
  });
});
