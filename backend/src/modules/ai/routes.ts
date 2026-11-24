import type { FastifyInstance } from 'fastify';
import { aiChatBody, mealPhotoBody } from '@gym/shared';
import { AiHttpError, type AiService } from './service';

export function registerAiRoutes(app: FastifyInstance, ai: AiService) {
  const limit = { rateLimit: { max: 15, timeWindow: '1 minute' } };
  const fail = (e: unknown, reply: any) => {
    if (e instanceof AiHttpError) return reply.code(e.status).send({ error: e.code });
    throw e;
  };

  app.get('/ai/status', { preHandler: app.authenticate }, async (req) => ai.status(req.user.sub));

  app.post('/ai/chat', { preHandler: app.authenticate, config: limit }, async (req, reply) => {
    const body = aiChatBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    try { return await ai.chat(req.user.sub, body.data); } catch (e) { return fail(e, reply); }
  });

  // A imagem só existe em memória durante o pedido: não é guardada nem registada nos logs.
  app.post('/ai/meal-photo', { preHandler: app.authenticate, config: limit, bodyLimit: 3_000_000 }, async (req, reply) => {
    const body = mealPhotoBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    try { return await ai.mealPhoto(req.user.sub, body.data); } catch (e) { return fail(e, reply); }
  });
}
