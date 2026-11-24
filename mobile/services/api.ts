import { authResponse, type AuthResponse } from '@gym/shared';
import { clearTokens, loadTokens, saveTokens } from './tokenStorage';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(`API ${status}: ${code}`); }
}
/** Sem ligação / servidor inacessível: a app continua em modo offline. */
export class NetworkError extends Error {}

async function raw(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  try {
    return await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        // sem corpo não se anuncia JSON: o servidor recusa DELETE/POST vazios com 400
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rest.headers ?? {}),
      },
    });
  } catch {
    throw new NetworkError('Sem ligação ao servidor');
  }
}

let refreshing: Promise<string> | null = null;

/** Renova a sessão (single-flight: pedidos concorrentes partilham o mesmo refresh, o token roda a cada uso). */
export function refreshSession(): Promise<string> {
  refreshing ??= (async () => {
    const tokens = await loadTokens();
    if (!tokens) throw new ApiError(401, 'no_session');
    const res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: tokens.refreshToken }) });
    if (!res.ok) {
      if (res.status === 401) await clearTokens();
      throw new ApiError(res.status, 'refresh_failed');
    }
    const data: AuthResponse = authResponse.parse(await res.json());
    await saveTokens(data);
    return data.accessToken;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const tokens = await loadTokens();
  let res = await raw(path, { ...init, token: tokens?.accessToken });
  if (res.status === 401 && tokens) {
    const fresh = await refreshSession();
    res = await raw(path, { ...init, token: fresh });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? 'error');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function loginWithGoogleIdToken(idToken: string): Promise<AuthResponse> {
  const res = await raw('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) });
  if (!res.ok) throw new ApiError(res.status, 'login_failed');
  return authResponse.parse(await res.json());
}

export async function logoutRemote() {
  const tokens = await loadTokens();
  if (tokens) await raw('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: tokens.refreshToken }) }).catch(() => {});
}
