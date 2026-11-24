import { bestNameMatch, nameSimilarity } from '../ai/diff';

/** Mapa exercício → ficheiro de animação (GIF/WebP). Os ficheiros NÃO vêm com a app: alojas tu os teus (com licença) e aponta `baseUrl`. */
export interface MediaManifest { baseUrl: string | null; credit: string | null; files: Record<string, string> }
export const EMPTY_MANIFEST: MediaManifest = { baseUrl: null, credit: null, files: {} };

export function mediaUrl(m: MediaManifest, exerciseId: string): string | null {
  const f = m.files[exerciseId]; if (!f) return null;
  if (/^https?:\/\//i.test(f)) return f;
  if (!m.baseUrl) return null;
  return `${m.baseUrl.replace(/\/+$/, '')}/${f.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
}

/** "0123-Barbell_Bench-Press_180x180.gif" → "barbell bench press" */
export function cleanMediaFileName(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/(^|[^0-9a-z])\d{2,4}x\d{2,4}(?=$|[^0-9a-z])/gi, ' ').replace(/^\s*\d+[\s._-]+/, '').replace(/[_\-.()]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface MediaMatch { exerciseId: string; file: string; score: number }
export interface MediaMatchReport { matches: MediaMatch[]; unmatched: string[]; duplicates: { exerciseId: string; files: string[] }[] }

/** Casa ficheiros com exercícios pelo nome (PT/EN). Fica com o melhor ficheiro por exercício; devolve o resto para revisão manual. */
export function matchMediaFiles(files: string[], exercises: { id: string; names: string[] }[], min = 0.6): MediaMatchReport {
  const best = new Map<string, MediaMatch>(); const extra = new Map<string, string[]>(); const unmatched: string[] = [];
  for (const file of files) {
    const m = bestNameMatch(cleanMediaFileName(file), exercises, min);
    if (!m) { unmatched.push(file); continue; }
    const cur = best.get(m.id);
    if (!cur) best.set(m.id, { exerciseId: m.id, file, score: m.score });
    else if (m.score > cur.score) { extra.set(m.id, [...(extra.get(m.id) ?? []), cur.file]); best.set(m.id, { exerciseId: m.id, file, score: m.score }); }
    else extra.set(m.id, [...(extra.get(m.id) ?? []), file]);
  }
  return { matches: [...best.values()].sort((a, b) => a.score - b.score), unmatched, duplicates: [...extra].map(([exerciseId, f]) => ({ exerciseId, files: f })) };
}

/** Índice do fotograma para uma animação por 2+ imagens (posição inicial ↔ final). */
export const frameIndex = (nowMs: number, frames: number, periodMs = 900) => (frames <= 1 ? 0 : Math.floor(nowMs / periodMs) % frames);
export { nameSimilarity };
