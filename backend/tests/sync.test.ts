import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { MemoryStore } from '../src/database/memoryStore';
import type { SyncChange } from '@gym/shared';

const google = { async verify(t: string) { return { googleId: `g-${t[0]}`, email: `${t[0]}@x.pt`, name: 'N', picture: null }; } };
let store: MemoryStore; let n = 0;
beforeEach(() => { store = new MemoryStore(); n = 0; });
const make = () => buildApp({ store, google, jwtSecret: 's'.repeat(40) });
const login = async (app: Awaited<ReturnType<typeof make>>, c = 'a') => { const r = (await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: c.repeat(30) } })).json(); return { auth: `Bearer ${r.accessToken}`, id: r.user.id as string }; };
const ch = (o: Partial<SyncChange> & Pick<SyncChange, 'entity' | 'entityId'>): SyncChange => ({ opId: `op-${++n}-${'x'.repeat(8)}`, op: 'upsert', payload: { v: 1 }, baseVersion: 0, clientUpdatedAt: 1000, ...o });
const push = (app: Awaited<ReturnType<typeof make>>, auth: string, changes: SyncChange[]) => app.inject({ method: 'POST', url: '/sync/push', headers: { authorization: auth }, payload: { changes } });
const pull = (app: Awaited<ReturnType<typeof make>>, auth: string, q = '') => app.inject({ method: 'GET', url: `/sync/pull${q}`, headers: { authorization: auth } });

describe('API de sync', () => {
  it('exige autenticação e valida pedidos', async () => {
    const app = await make(); const { auth } = await login(app);
    expect((await app.inject({ method: 'POST', url: '/sync/push', payload: { changes: [] } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/sync/pull' })).statusCode).toBe(401);
    expect((await push(app, auth, [])).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/sync/push', headers: { authorization: auth }, payload: { changes: [{ ...ch({ entity: 'food', entityId: 'f1' }), entity: 'users' }] } })).statusCode).toBe(400); // entidade desconhecida
    expect((await app.inject({ method: 'POST', url: '/sync/push', headers: { authorization: auth }, payload: { changes: [{ ...ch({ entity: 'food', entityId: 'f1' }), userId: 'outro' }] } })).statusCode).toBe(400); // campos extra
    expect((await push(app, auth, Array.from({ length: 51 }, (_, i) => ch({ entity: 'food', entityId: `f${i}` })))).statusCode).toBe(400);
    expect((await pull(app, auth, '?limit=9999')).statusCode).toBe(400);
  });

  it('push → pull devolve o documento; cursor e paginação ordenados por seq entre entidades', async () => {
    const app = await make(); const { auth } = await login(app);
    const r = (await push(app, auth, [ch({ entity: 'food', entityId: 'f1', payload: { name: 'Aveia' } }), ch({ entity: 'nutrition_entry', entityId: 'e1' }), ch({ entity: 'workout_plan', entityId: 'p1' })])).json();
    expect(r.results.map((x: any) => x.status)).toEqual(['applied', 'applied', 'applied']);
    const p1 = (await pull(app, auth, '?limit=2')).json();
    expect(p1.changes.map((c: any) => c.entityId)).toEqual(['f1', 'e1']); expect(p1.hasMore).toBe(true);
    const p2 = (await pull(app, auth, `?cursor=${p1.nextCursor}&limit=2`)).json();
    expect(p2.changes.map((c: any) => c.entityId)).toEqual(['p1']); expect(p2.hasMore).toBe(false);
    expect((await pull(app, auth, `?cursor=${p2.nextCursor}`)).json().changes).toEqual([]);
    expect(p1.changes[0]).toMatchObject({ entity: 'food', data: { name: 'Aveia' }, version: 1, deleted: false });
  });

  it('isolamento: utilizador B nunca vê nem altera dados de A (mesmo com o mesmo entityId)', async () => {
    const app = await make(); const a = await login(app, 'a'), b = await login(app, 'b');
    await push(app, a.auth, [ch({ entity: 'food', entityId: 'f1', payload: { owner: 'a' } })]);
    expect((await pull(app, b.auth)).json().changes).toEqual([]);
    await push(app, b.auth, [ch({ entity: 'food', entityId: 'f1', payload: { owner: 'b' } })]);
    expect((await pull(app, a.auth)).json().changes[0].data).toEqual({ owner: 'a' });
    expect((await pull(app, b.auth)).json().changes[0].data).toEqual({ owner: 'b' });
  });

  it('idempotência: reenviar a mesma operação não duplica nem gera conflito', async () => {
    const app = await make(); const { auth } = await login(app);
    const c = ch({ entity: 'workout_plan', entityId: 'p1' });
    expect((await push(app, auth, [c])).json().results[0]).toMatchObject({ status: 'applied', version: 1 });
    expect((await push(app, auth, [c])).json().results[0]).toMatchObject({ status: 'applied', version: 1 }); // resposta perdida → reenvio
    expect((await pull(app, auth)).json().changes).toHaveLength(1);
  });

  it('plano (versioned): versão concorrente → conflito com o documento do servidor; resolver com a versão certa', async () => {
    const app = await make(); const { auth } = await login(app);
    await push(app, auth, [ch({ entity: 'workout_plan', entityId: 'p1', payload: { name: 'v1' } })]);
    // dispositivo 1 atualiza (base 1 → 2)
    expect((await push(app, auth, [ch({ entity: 'workout_plan', entityId: 'p1', payload: { name: 'do-dispositivo-1' }, baseVersion: 1 })])).json().results[0]).toMatchObject({ status: 'applied', version: 2 });
    // dispositivo 2 (offline, ainda na versão 1) tenta atualizar → conflito
    const r = (await push(app, auth, [ch({ entity: 'workout_plan', entityId: 'p1', payload: { name: 'do-dispositivo-2' }, baseVersion: 1 })])).json().results[0];
    expect(r).toMatchObject({ status: 'conflict', version: 2, serverDoc: { data: { name: 'do-dispositivo-1' }, version: 2, deleted: false } });
    expect((await pull(app, auth)).json().changes[0].data).toEqual({ name: 'do-dispositivo-1' }); // servidor não foi alterado
    // "manter o meu": reenvia com baseVersion = versão do servidor
    expect((await push(app, auth, [ch({ entity: 'workout_plan', entityId: 'p1', payload: { name: 'do-dispositivo-2' }, baseVersion: 2 })])).json().results[0]).toMatchObject({ status: 'applied', version: 3 });
  });

  it('sessão (immutable): a 1.ª escrita ganha; histórico nunca é reescrito; pode ser apagado', async () => {
    const app = await make(); const { auth } = await login(app);
    await push(app, auth, [ch({ entity: 'workout_session', entityId: 's1', payload: { volume: 100 } })]);
    const again = (await push(app, auth, [ch({ entity: 'workout_session', entityId: 's1', payload: { volume: 999 }, clientUpdatedAt: 9999 })])).json().results[0];
    expect(again.status).toBe('applied');
    expect((await pull(app, auth)).json().changes[0].data).toEqual({ volume: 100 });
    expect((await push(app, auth, [ch({ entity: 'workout_session', entityId: 's1', op: 'delete', payload: undefined })])).json().results[0].status).toBe('applied');
    const c = (await pull(app, auth)).json().changes; expect(c.at(-1)).toMatchObject({ entityId: 's1', deleted: true, data: null });
  });

  it('restantes (LWW): a escrita mais recente ganha; a antiga fica "superseded" com o doc do servidor', async () => {
    const app = await make(); const { auth } = await login(app);
    await push(app, auth, [ch({ entity: 'food', entityId: 'f1', payload: { kcal: 100 }, clientUpdatedAt: 2000 })]);
    const old = (await push(app, auth, [ch({ entity: 'food', entityId: 'f1', payload: { kcal: 50 }, clientUpdatedAt: 1500 })])).json().results[0];
    expect(old).toMatchObject({ status: 'superseded', serverDoc: { data: { kcal: 100 } } });
    expect((await push(app, auth, [ch({ entity: 'food', entityId: 'f1', payload: { kcal: 120 }, clientUpdatedAt: 3000 })])).json().results[0]).toMatchObject({ status: 'applied', version: 2 });
    expect((await pull(app, auth)).json().changes.at(-1).data).toEqual({ kcal: 120 });
  });

  it('apagar propaga como tombstone; apagar o que o servidor nunca viu é inofensivo', async () => {
    const app = await make(); const a = await login(app);
    await push(app, a.auth, [ch({ entity: 'recipe', entityId: 'r1', payload: { n: 1 }, clientUpdatedAt: 1000 })]);
    const cursor = (await pull(app, a.auth)).json().nextCursor;
    await push(app, a.auth, [ch({ entity: 'recipe', entityId: 'r1', op: 'delete', payload: undefined, clientUpdatedAt: 2000 })]);
    expect((await pull(app, a.auth, `?cursor=${cursor}`)).json().changes[0]).toMatchObject({ entityId: 'r1', deleted: true });
    expect((await push(app, a.auth, [ch({ entity: 'food', entityId: 'nunca-existiu', op: 'delete', payload: undefined })])).json().results[0].status).toBe('applied');
  });

  it('rejeita payload em falta e demasiado grande, sem escrever', async () => {
    const app = await make(); const { auth } = await login(app);
    expect((await push(app, auth, [ch({ entity: 'food', entityId: 'f1', payload: undefined })])).json().results[0]).toMatchObject({ status: 'rejected', reason: 'payload_required' });
    expect((await push(app, auth, [ch({ entity: 'nutrition_goal', entityId: 'g', payload: { x: 'y'.repeat(6000) } })])).json().results[0]).toMatchObject({ status: 'rejected', reason: 'too_large' });
    expect((await pull(app, auth)).json().changes).toEqual([]);
  });

  it('exportação completa (RGPD/backup) só dos próprios dados; apagar conta remove tudo', async () => {
    const app = await make(); const a = await login(app, 'a'), b = await login(app, 'b');
    await push(app, a.auth, [ch({ entity: 'food', entityId: 'f1', payload: { name: 'A' } }), ch({ entity: 'workout_plan', entityId: 'p1', payload: { name: 'P' } })]);
    await push(app, b.auth, [ch({ entity: 'food', entityId: 'f9', payload: { name: 'B' } })]);
    const ex = (await app.inject({ method: 'GET', url: '/me/export', headers: { authorization: a.auth } })).json();
    expect(ex.account.email).toBe('a@x.pt'); expect(ex.collections.food).toEqual([{ id: 'f1', version: 1, data: { name: 'A' } }]); expect(ex.collections.workout_plan).toHaveLength(1);
    expect(JSON.stringify(ex)).not.toContain('"B"');
    expect((await app.inject({ method: 'GET', url: '/me/export' })).statusCode).toBe(401);
    await app.inject({ method: 'DELETE', url: '/me', headers: { authorization: a.auth } });
    expect([...store.syncRepo.docs.values()].filter((d) => d.userId === a.id)).toHaveLength(0);
    expect((await pull(app, b.auth)).json().changes).toHaveLength(1);
  });

  it('duas alterações do mesmo lote são aplicadas por ordem', async () => {
    const app = await make(); const { auth } = await login(app);
    const r = (await push(app, auth, [ch({ entity: 'food', entityId: 'f1', payload: { v: 1 }, clientUpdatedAt: 1000 }), ch({ entity: 'food', entityId: 'f1', payload: { v: 2 }, clientUpdatedAt: 1001 })])).json().results;
    expect(r.map((x: any) => [x.status, x.version])).toEqual([['applied', 1], ['applied', 2]]);
    expect((await pull(app, auth)).json().changes[0].data).toEqual({ v: 2 });
  });
});
