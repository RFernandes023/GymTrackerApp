import { create } from 'zustand';
import { syncCounts, syncOnce } from '../features/sync/engine';
import { remoteSyncApi } from '../services/syncApi';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';
interface SyncState {
  status: SyncStatus; lastSyncAt: number | null; pending: number; blocked: number; conflicts: number; failedApply: number; message: string | null;
  userId: string | null; failures: number; nextAt: number;
  setUser: (id: string | null) => void;
  refresh: () => Promise<void>;
  /** `force` ignora o recuo exponencial (botão "Sincronizar agora"). */
  run: (force?: boolean) => Promise<void>;
}

let inFlight = false;

export const useSync = create<SyncState>((set, get) => ({
  status: 'idle', lastSyncAt: null, pending: 0, blocked: 0, conflicts: 0, failedApply: 0, message: null, userId: null, failures: 0, nextAt: 0,
  setUser: (userId) => set({ userId, status: 'idle', failures: 0, nextAt: 0, message: null }),
  async refresh() { const u = get().userId; if (u) set(await syncCounts(u)); },
  async run(force = false) {
    const { userId, nextAt } = get();
    if (!userId || inFlight || (!force && Date.now() < nextAt)) return;
    inFlight = true; set({ status: 'syncing' });
    try {
      const o = await syncOnce(userId, remoteSyncApi);
      const counts = await syncCounts(userId);
      if (o.error) {
        const failures = get().failures + 1; // recuo exponencial: 5 s, 10 s, 20 s … máx. 5 min
        set({ ...counts, failures, nextAt: Date.now() + Math.min(300_000, 5000 * 2 ** (failures - 1)), status: o.error === 'offline' ? 'offline' : 'error',
          message: o.error === 'offline' ? 'Sem ligação. As alterações ficam guardadas e são enviadas quando houver rede.' : o.error === 'auth' ? 'Sessão expirada. Volta a iniciar sessão.' : 'O servidor não respondeu. Nova tentativa automática em breve.' });
      } else {
        set({ ...counts, failures: 0, nextAt: 0, lastSyncAt: Date.now(), failedApply: o.failedApply, status: counts.conflicts > 0 ? 'conflict' : 'idle', message: o.failedApply ? `${o.failedApply} alteração(ões) recebida(s) não puderam ser aplicadas.` : null });
      }
    } finally { inFlight = false; }
  },
}));
