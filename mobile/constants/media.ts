import { EMPTY_MANIFEST, type MediaManifest } from '@gym/shared';
import generated from '../assets/exercise-media.json';

/**
 * Manifesto das animações. Vazio por defeito: a app usa os fotogramas do Free Exercise DB.
 * Para usar GIFs licenciados (ex.: GymVisual): `npx tsx tools/build-media-manifest.ts <pasta> --base <url>` (ver docs/exercise-media.md).
 * `EXPO_PUBLIC_EXERCISE_MEDIA_URL` e `EXPO_PUBLIC_EXERCISE_MEDIA_CREDIT` substituem o URL base e o crédito sem regenerar o manifesto.
 */
export const MEDIA_MANIFEST: MediaManifest = {
  ...EMPTY_MANIFEST, ...(generated as Partial<MediaManifest>),
  baseUrl: process.env.EXPO_PUBLIC_EXERCISE_MEDIA_URL ?? (generated as Partial<MediaManifest>).baseUrl ?? null,
  credit: process.env.EXPO_PUBLIC_EXERCISE_MEDIA_CREDIT ?? (generated as Partial<MediaManifest>).credit ?? null,
};
