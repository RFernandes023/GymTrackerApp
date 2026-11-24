import { useEffect, useState } from 'react';

/** Relógio que atualiza a UI; o tempo real é SEMPRE derivado de timestamps (Date.now), não do nº de ticks. */
export function useNow(intervalMs = 250, enabled = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
}
