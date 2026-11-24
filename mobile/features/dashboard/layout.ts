import { DASHBOARD_CARD_DEFS } from '@gym/shared';

export interface CardState { type: string; position: number; enabled: boolean }

const normalize = (cards: CardState[]): CardState[] => {
  const enabled = cards.filter((c) => c.enabled).sort((a, b) => a.position - b.position);
  const disabled = cards.filter((c) => !c.enabled).sort((a, b) => a.position - b.position);
  return [...enabled, ...disabled].map((c, i) => ({ ...c, position: i }));
};

export function defaultLayout(): CardState[] {
  return normalize(DASHBOARD_CARD_DEFS.map((d, i) => ({ type: d.type, position: i, enabled: d.defaultEnabled })));
}

/** Acrescenta cartões novos (de versões futuras da app) e remove tipos que já não existem. */
export function reconcile(saved: CardState[]): CardState[] {
  const known = new Set(DASHBOARD_CARD_DEFS.map((d) => d.type));
  const kept = saved.filter((c) => known.has(c.type));
  const have = new Set(kept.map((c) => c.type));
  const missing = DASHBOARD_CARD_DEFS.filter((d) => !have.has(d.type)).map((d, i) => ({
    type: d.type, position: kept.length + i, enabled: false,
  }));
  return normalize([...kept, ...missing]);
}

export function setEnabled(layout: CardState[], type: string, enabled: boolean): CardState[] {
  const maxEnabled = Math.max(-1, ...layout.filter((c) => c.enabled).map((c) => c.position));
  return normalize(layout.map((c) => (c.type === type ? { ...c, enabled, position: enabled ? maxEnabled + 0.5 : c.position } : c)));
}

export function move(layout: CardState[], type: string, dir: -1 | 1): CardState[] {
  const enabled = layout.filter((c) => c.enabled).sort((a, b) => a.position - b.position);
  const i = enabled.findIndex((c) => c.type === type);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= enabled.length) return layout;
  const a = enabled[i]!, b = enabled[j]!;
  return normalize(layout.map((c) => (c.type === a.type ? { ...c, position: b.position } : c.type === b.type ? { ...c, position: a.position } : c)));
}
