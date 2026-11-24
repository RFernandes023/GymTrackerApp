import { create } from 'zustand';
import { loadLayout, saveLayout } from '../features/dashboard/layoutRepo';
import { move, setEnabled, type CardState } from '../features/dashboard/layout';

interface DashboardState {
  userId: string | null;
  layout: CardState[];
  editing: boolean;
  load: (userId: string) => Promise<void>;
  toggle: (type: string, enabled: boolean) => Promise<void>;
  moveCard: (type: string, dir: -1 | 1) => Promise<void>;
  setEditing: (v: boolean) => void;
}

export const useDashboard = create<DashboardState>((set, get) => ({
  userId: null,
  layout: [],
  editing: false,
  async load(userId) { set({ userId, layout: await loadLayout(userId) }); },
  async toggle(type, enabled) {
    const { userId, layout } = get(); if (!userId) return;
    const next = setEnabled(layout, type, enabled);
    set({ layout: next }); await saveLayout(userId, next);
  },
  async moveCard(type, dir) {
    const { userId, layout } = get(); if (!userId) return;
    const next = move(layout, type, dir);
    set({ layout: next }); await saveLayout(userId, next);
  },
  setEditing: (editing) => set({ editing }),
}));
