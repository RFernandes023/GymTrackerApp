/**
 * Duração baseada em timestamps (ms desde epoch), nunca em contagem de ticks:
 * continua correta com a app em segundo plano ou com o ecrã bloqueado.
 */
export function elapsedMs(startedAt: number, now: number, pausedTotalMs = 0): number {
  return Math.max(0, now - startedAt - pausedTotalMs);
}

export function remainingMs(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
