import { create } from 'zustand';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import type { UserDTO } from '@gym/shared';
import { kvDelete, kvGet, kvSet } from '../database/kv';
import { wipeLocalData } from '../database/db';
import { ApiError, NetworkError, apiFetch, loginWithGoogleIdToken, logoutRemote } from '../services/api';
import { clearTokens, loadTokens, saveTokens } from '../services/tokenStorage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: UserDTO | null;
  error: string | null;
  init: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const USER_KEY = 'auth.user';

GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  error: null,

  // Offline-first: se existe sessão guardada, entra com o utilizador em cache e valida em segundo plano.
  async init() {
    const tokens = await loadTokens();
    const cached = await kvGet(USER_KEY);
    if (!tokens || !cached) { set({ status: 'signedOut', user: null }); return; }
    set({ status: 'signedIn', user: JSON.parse(cached) as UserDTO });
    try {
      const me = await apiFetch<UserDTO>('/me');
      await kvSet(USER_KEY, JSON.stringify(me));
      set({ user: me });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await get().signOut();
      else if (!(e instanceof NetworkError)) console.warn('Falha a validar sessão', e);
    }
  },

  async signInWithGoogle() {
    set({ error: null });
    try {
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res) || !res.data.idToken) return; // cancelado pelo utilizador
      const auth = await loginWithGoogleIdToken(res.data.idToken);
      await saveTokens(auth);
      await kvSet(USER_KEY, JSON.stringify(auth.user));
      set({ status: 'signedIn', user: auth.user });
    } catch (e) {
      set({ error: e instanceof NetworkError ? 'Sem ligação ao servidor. O primeiro login requer internet.' : 'Não foi possível iniciar sessão.' });
    }
  },

  async signOut() {
    await logoutRemote();
    await clearTokens();
    await kvDelete(USER_KEY);
    await GoogleSignin.signOut().catch(() => {});
    set({ status: 'signedOut', user: null });
  },

  // RGPD: apaga no servidor primeiro (exige ligação); só depois limpa o dispositivo.
  async deleteAccount() {
    await apiFetch('/me', { method: 'DELETE' });
    await wipeLocalData();
    await clearTokens();
    await GoogleSignin.revokeAccess().catch(() => {});
    set({ status: 'signedOut', user: null });
  },
}));
