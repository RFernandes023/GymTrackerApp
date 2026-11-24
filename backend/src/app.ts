import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import type { Store } from './database/store';
import type { GoogleVerifier } from './integrations/googleVerifier';
import { registerAuthRoutes } from './modules/auth/routes';
import { registerUserRoutes } from './modules/users/routes';
import { registerAiRoutes } from './modules/ai/routes';
import { registerSyncRoutes } from './modules/sync/routes';
import { AiService } from './modules/ai/service';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: string }; user: { sub: string } }
}

export interface AppOptions {
  store: Store;
  google: GoogleVerifier;
  jwtSecret: string;
  corsOrigins?: string[];
  logger?: boolean;
  /** Serviço de IA (opcional). Sem ele, /ai/* responde 503 "ai_unavailable". */
  ai?: AiService;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({
    logger: opts.logger
      ? { level: 'info', redact: ['req.headers.authorization', 'req.body.idToken', 'req.body.refreshToken', 'req.body.imageBase64'] }
      : false,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet);
  await app.register(cors, { origin: opts.corsOrigins?.length ? opts.corsOrigins : false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(jwt, { secret: opts.jwtSecret });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify(); } catch { await reply.code(401).send({ error: 'unauthorized' }); }
  });

  app.get('/health', async () => ({ status: 'ok' }));
  registerAuthRoutes(app, { store: opts.store, google: opts.google });
  registerUserRoutes(app, opts.store);
  registerSyncRoutes(app, opts.store);
  registerAiRoutes(app, opts.ai ?? new AiService({ provider: null, dailyLimit: 1, mealLimit: 1, costNote: '' }, opts.store));
  return app;
}
