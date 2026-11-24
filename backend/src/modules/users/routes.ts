import type { FastifyInstance } from 'fastify';
import type { Store } from '../../database/store';

export function registerUserRoutes(app: FastifyInstance, store: Store) {
  app.get('/me', { preHandler: app.authenticate }, async (req, reply) => {
    const user = await store.findUserById(req.user.sub);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return { id: user.id, email: user.email, name: user.name, picture: user.picture };
  });

  // RGPD: exportação completa dos dados guardados na cloud (também serve de backup).
  app.get('/me/export', { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => store.exportUserData(req.user.sub));

  // RGPD: eliminação da conta e de todos os dados associados.
  app.delete('/me', { preHandler: app.authenticate }, async (req, reply) => {
    await store.deleteUserAndData(req.user.sub);
    return reply.code(204).send();
  });
}
