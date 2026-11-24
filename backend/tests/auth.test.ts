import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app';
import { MemoryStore } from '../src/database/memoryStore';
import type { GoogleVerifier } from '../src/integrations/googleVerifier';
import { loadEnv } from '../src/config/env';

const fakeGoogle: GoogleVerifier = {
  async verify(token) {
    if (token.startsWith('valid-a')) return { googleId: 'g-a', email: 'a@x.pt', name: 'Ana', picture: null };
    if (token.startsWith('valid-b')) return { googleId: 'g-b', email: 'b@x.pt', name: 'Bruno', picture: null };
    throw new Error('bad');
  },
};
const TOKEN_A = 'valid-a-' + 'x'.repeat(30);
const TOKEN_B = 'valid-b-' + 'x'.repeat(30);

let store: MemoryStore;
const make = () => buildApp({ store, google: fakeGoogle, jwtSecret: 's'.repeat(40) });
const login = async (app: Awaited<ReturnType<typeof make>>, idToken: string) =>
  (await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken } })).json();

beforeEach(() => { store = new MemoryStore(); });

describe('auth', () => {
  it('login Google cria utilizador e devolve tokens', async () => {
    const app = await make();
    const res = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: TOKEN_A } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe('a@x.pt');
    expect(body.accessToken).toBeTruthy();
    expect(store.users.size).toBe(1);
  });
  it('mesmo googleId não duplica utilizador', async () => {
    const app = await make();
    await login(app, TOKEN_A); await login(app, TOKEN_A);
    expect(store.users.size).toBe(1);
  });
  it('token Google inválido → 401', async () => {
    const app = await make();
    const res = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'bad-' + 'x'.repeat(30) } });
    expect(res.statusCode).toBe(401);
  });
  it('body inválido → 400', async () => {
    const app = await make();
    const res = await app.inject({ method: 'POST', url: '/auth/google', payload: {} });
    expect(res.statusCode).toBe(400);
  });
  it('rota privada exige JWT', async () => {
    const app = await make();
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    const { accessToken } = await login(app, TOKEN_A);
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('a@x.pt');
  });
  it('refresh roda o token e rejeita reutilização', async () => {
    const app = await make();
    const { refreshToken } = await login(app, TOKEN_A);
    const r1 = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().refreshToken).not.toBe(refreshToken);
    const r2 = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(r2.statusCode).toBe(401);
  });
  it('logout revoga o refresh token', async () => {
    const app = await make();
    const { refreshToken } = await login(app, TOKEN_A);
    expect((await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } })).statusCode).toBe(401);
  });
  it('DELETE /me elimina conta e tokens; outro utilizador não é afetado', async () => {
    const app = await make();
    const a = await login(app, TOKEN_A); const b = await login(app, TOKEN_B);
    const del = await app.inject({ method: 'DELETE', url: '/me', headers: { authorization: `Bearer ${a.accessToken}` } });
    expect(del.statusCode).toBe(204);
    expect(store.users.size).toBe(1);
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: a.refreshToken } })).statusCode).toBe(401);
    const me = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${b.accessToken}` } });
    expect(me.json().email).toBe('b@x.pt');
  });
  it('JWT de utilizador apagado deixa de funcionar em /me', async () => {
    const app = await make();
    const a = await login(app, TOKEN_A);
    await app.inject({ method: 'DELETE', url: '/me', headers: { authorization: `Bearer ${a.accessToken}` } });
    const me = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${a.accessToken}` } });
    expect(me.statusCode).toBe(401);
  });
});

describe('env', () => {
  it('rejeita JWT_SECRET curto', () => {
    expect(() => loadEnv({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 'curto', GOOGLE_CLIENT_IDS: 'a' } as any)).toThrow(/JWT_SECRET/);
  });
  it('aceita config válida', () => {
    const e = loadEnv({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 'x'.repeat(32), GOOGLE_CLIENT_IDS: 'a, b' } as any);
    expect(e.GOOGLE_CLIENT_IDS).toEqual(['a', 'b']);
  });
});
