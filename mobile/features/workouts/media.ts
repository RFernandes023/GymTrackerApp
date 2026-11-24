import { mediaUrl, type MediaManifest } from '@gym/shared';
import type { Exercise } from './types';

const FRAMES_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export type ExerciseMediaSource =
  | { kind: 'gif'; uri: string; credit: string | null }   // animação própria (ex.: GymVisual com a TUA licença), via manifesto
  | { kind: 'frames'; uris: string[] }                     // Free Exercise DB (domínio público): posição inicial ↔ final em ciclo
  | null;

/** Escolhe a melhor média para um exercício: animação licenciada do manifesto → fotogramas do Free Exercise DB → nada (ícone). */
export function resolveMedia(e: Pick<Exercise, 'id' | 'images' | 'isCustom'>, manifest: MediaManifest): ExerciseMediaSource {
  const url = mediaUrl(manifest, e.id);
  if (url) return { kind: 'gif', uri: url, credit: manifest.credit };
  if (!e.isCustom && e.images.length) return { kind: 'frames', uris: e.images.slice(0, 2).map((i) => FRAMES_BASE + i) };
  return null; // exercícios personalizados não têm imagem: nunca se mostra imagem de outro exercício
}
