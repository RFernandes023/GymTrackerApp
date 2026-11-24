import * as FS from 'expo-file-system/legacy';

export const TEMP_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const IMG = /\.(jpe?g|png|heic|webp|json)$/i; // imagens da câmara/OCR e ficheiros de exportação temporários

/** `modificationTime` do expo-file-system está em segundos. */
export const isExpired = (modificationTimeSec: number | undefined, now: number, maxAgeMs = TEMP_MAX_AGE_MS) =>
  modificationTimeSec === undefined || now - modificationTimeSec * 1000 > maxAgeMs;

/** Apaga uma imagem temporária (idempotente; nunca lança). */
export async function deleteTempImage(uri: string | null | undefined) {
  if (!uri) return;
  try { await FS.deleteAsync(uri, { idempotent: true }); } catch { /* já não existe */ }
}

/** Rotina de limpeza: remove imagens da câmara com mais de 7 dias (as de OCR são apagadas logo após o uso; isto cobre falhas/fechos inesperados). */
export async function cleanupTempImages(now = Date.now()): Promise<number> {
  const root = FS.cacheDirectory; if (!root) return 0;
  let removed = 0;
  for (const dir of [`${root}Camera/`, `${root}label-ocr/`, `${root}exports/`]) {
    try {
      const info = await FS.getInfoAsync(dir);
      if (!info.exists || !info.isDirectory) continue;
      for (const name of await FS.readDirectoryAsync(dir)) {
        if (!IMG.test(name)) continue;
        const f = await FS.getInfoAsync(dir + name);
        if (f.exists && isExpired((f as any).modificationTime, now)) { await FS.deleteAsync(dir + name, { idempotent: true }); removed++; }
      }
    } catch { /* diretoria inexistente/sem permissões: ignorar */ }
  }
  return removed;
}
