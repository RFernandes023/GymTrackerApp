import type { FastifyInstance } from 'fastify';
import { syncPullQuery, syncPushBody } from '@gym/shared';
import type { Store } from '../../database/store';

export function registerSyncRoutes(app: FastifyInstance, store: Store) {
  // O userId vem SEMPRE do JWT: um utilizador nunca lê nem escreve dados de outro.
  app.post('/sync/push', { preHandler: app.authenticate, bodyLimit: 3_500_000, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = syncPushBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const results = [];
    for (const c of body.data.changes) results.push(await store.syncPush(req.user.sub, c));
    return { results };
  });

  app.get('/sync/pull', { preHandler: app.authenticate, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const q = syncPullQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    return store.syncPull(req.user.sub, q.data.cursor, q.data.limit);
  });
}
