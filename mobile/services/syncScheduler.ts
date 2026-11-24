import { AppState } from 'react-native';
import { onEnqueue } from '../database/syncQueue';
import { useSync } from '../store/syncStore';

/** Dispara a sincronização: ao iniciar, a cada minuto, ao voltar ao primeiro plano e (com debounce) após cada escrita local. */
export function startSyncScheduler(userId: string) {
  const { setUser, run, refresh } = useSync.getState();
  setUser(userId); void refresh(); void run(true);
  const interval = setInterval(() => void useSync.getState().run(), 60_000);
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') void useSync.getState().run(true); });
  let t: ReturnType<typeof setTimeout> | null = null;
  const off = onEnqueue(() => { void useSync.getState().refresh(); if (t) clearTimeout(t); t = setTimeout(() => void useSync.getState().run(), 3000); });
  return () => { clearInterval(interval); app.remove(); off(); if (t) clearTimeout(t); useSync.getState().setUser(null); };
}
