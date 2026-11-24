const STOP = new Set(['com', 'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'with', 'the', 'and', 'on', 'of', 'em', 'no', 'na']);

export const normalizeName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => new Set(normalizeName(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)));

/** 1 = nome igual (normalizado); senão índice de Jaccard dos termos significativos. */
export function nameSimilarity(a: string, b: string): number {
  if (normalizeName(a) === normalizeName(b)) return 1;
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((t) => B.has(t)).length;
  return inter / (A.size + B.size - inter);
}

export function bestNameMatch(name: string, candidates: { id: string; names: string[] }[], min = 0.6): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) for (const n of c.names) {
    if (!n) continue;
    const s = nameSimilarity(name, n);
    if (s >= min && (!best || s > best.score)) best = { id: c.id, score: s };
  }
  return best;
}

export interface DiffExercise { exerciseId: string | null; name: string; sets: number; repMin: number; repMax: number; weight: number | null; restSeconds: number | null }
export interface DiffDay { name: string; exercises: DiffExercise[] }
export interface DiffItem { kind: 'new_day' | 'add' | 'remove' | 'change'; day: string; exercise?: string; detail: string }

const key = (e: DiffExercise) => e.exerciseId ?? `new:${normalizeName(e.name)}`;
const kg = (w: number) => String(Math.round(w * 100) / 100).replace('.', ',');
export const describeExercise = (e: DiffExercise) => `${e.sets}×${e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}${e.weight ? ` @ ${kg(e.weight)} kg` : ''}${e.restSeconds ? ` · ${e.restSeconds}s` : ''}`;

/**
 * O que a proposta acrescenta, remove ou altera. Só considera os dias mencionados na proposta (nunca apaga dias).
 * `current` e `proposed` devem estar resolvidos para a biblioteca (exerciseId) para que renomeações não pareçam remoção+adição.
 */
export function diffPlan(current: { days: DiffDay[] } | null, proposed: { days: DiffDay[] }): DiffItem[] {
  const out: DiffItem[] = [];
  for (const pd of proposed.days) {
    const cd = current?.days.find((d) => normalizeName(d.name) === normalizeName(pd.name));
    if (!cd) {
      out.push({ kind: 'new_day', day: pd.name, detail: 'Novo dia de treino' });
      for (const e of pd.exercises) out.push({ kind: 'add', day: pd.name, exercise: e.name, detail: describeExercise(e) });
      continue;
    }
    const cur = new Map(cd.exercises.map((e) => [key(e), e]));
    const seen = new Set<string>();
    for (const e of pd.exercises) {
      const k = key(e); seen.add(k);
      const c = cur.get(k);
      if (!c) { out.push({ kind: 'add', day: pd.name, exercise: e.name, detail: describeExercise(e) }); continue; }
      const same = c.sets === e.sets && c.repMin === e.repMin && c.repMax === e.repMax && (e.weight == null || e.weight === c.weight) && (e.restSeconds == null || e.restSeconds === c.restSeconds);
      if (!same) out.push({ kind: 'change', day: pd.name, exercise: e.name, detail: `${describeExercise(c)} → ${describeExercise({ ...e, weight: e.weight ?? c.weight, restSeconds: e.restSeconds ?? c.restSeconds })}` });
    }
    for (const [k, c] of cur) if (!seen.has(k)) out.push({ kind: 'remove', day: pd.name, exercise: c.name, detail: describeExercise(c) });
  }
  return out;
}
