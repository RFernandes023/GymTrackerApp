import { freshDb } from '../tests/testDb';
import { useAuth } from '../store/authStore';
import { useDashboard } from '../store/dashboardStore';

export const USER = { id: 'u-ui', email: 'ana@x.pt', name: 'Ana Silva', picture: null };

/** Dispositivo novo: SQLite migrado + seed de exercícios e sessão iniciada. */
export async function device() {
  (global as any).__db = await freshDb();
  useAuth.setState({ status: 'signedIn', user: USER, error: null });
  useDashboard.setState({ userId: null, layout: [], editing: false });
}
export const setParams = (p: Record<string, string>) => (require('expo-router') as any).__setParams(p);
export const routerMock = () => (require('expo-router') as any).router as Record<string, jest.Mock>;
