import type { FastifyInstance } from 'fastify';
import { googleLoginBody, refreshBody, type AuthResponse } from '@gym/shared';
import type { Store, UserRecord } from '../../database/store';
import type { GoogleVerifier } from '../../integrations/googleVerifier';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_MS, hashToken, newRefreshToken } from './tokens';

export interface AuthDeps { store: Store; google: GoogleVerifier }

const toDTO = (u: UserRecord) => ({ id: u.id, email: u.email, name: u.name, picture: u.picture });

export function registerAuthRoutes(app: FastifyInstance, { store, google }: AuthDeps) {
  async function issue(user: UserRecord): Promise<AuthResponse> {
    const accessToken = app.jwt.sign({ sub: user.id }, { expiresIn: ACCESS_TTL_SECONDS });
    const refreshToken = newRefreshToken();
    await store.saveRefreshToken({
      hash: hashToken(refreshToken), userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { user: toDTO(user), accessToken, refreshToken, accessTokenExpiresInSeconds: ACCESS_TTL_SECONDS };
  }

  const strictLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/google', strictLimit, async (req, reply) => {
    const body = googleLoginBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    let profile;
    try { profile = await google.verify(body.data.idToken); }
    catch { return reply.code(401).send({ error: 'invalid_google_token' }); }
    const user = await store.upsertUserByGoogle(profile);
    return issue(user);
  });

  app.post('/auth/refresh', strictLimit, async (req, reply) => {
    const body = refreshBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    // Rotação: o token usado é consumido; reutilização de um token antigo falha.
    const found = await store.consumeRefreshToken(hashToken(body.data.refreshToken));
    if (!found) return reply.code(401).send({ error: 'invalid_refresh_token' });
    const user = await store.findUserById(found.userId);
    if (!user) return reply.code(401).send({ error: 'invalid_refresh_token' });
    return issue(user);
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = refreshBody.safeParse(req.body);
    if (body.success) await store.revokeRefreshToken(hashToken(body.data.refreshToken));
    return reply.code(204).send();
  });
}
