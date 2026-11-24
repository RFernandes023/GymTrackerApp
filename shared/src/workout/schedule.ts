export interface ScheduleDay { id: string; name: string; dayOfWeek: number | null; position: number }

/**
 * Escolhe o treino de hoje e o próximo.
 * - Com dias da semana definidos (1=segunda … 7=domingo): hoje = dia marcado para hoje; próximo = o mais próximo a partir de hoje
 *   (se o treino de hoje já foi feito, a partir de amanhã).
 * - Plano flexível (sem dias da semana): sem "treino de hoje"; próximo = o seguinte ao último treino feito, em rotação.
 */
export function pickWorkouts(a: { days: ScheduleDay[]; todayDow: number; lastCompletedDayId: string | null; trainedTodayDayIds: string[] }) {
  const days = [...a.days].sort((x, y) => x.position - y.position);
  if (days.length === 0) return { today: null, next: null };
  const scheduled = days.filter((d) => d.dayOfWeek != null);
  if (scheduled.length > 0) {
    const today = scheduled.find((d) => d.dayOfWeek === a.todayDow) ?? null;
    const doneToday = today ? a.trainedTodayDayIds.includes(today.id) : false;
    const dist = (d: ScheduleDay) => { const k = (d.dayOfWeek! - a.todayDow + 7) % 7; return k === 0 && doneToday ? 7 : k; };
    const next = [...scheduled].sort((x, y) => dist(x) - dist(y))[0]!;
    return { today, next };
  }
  const i = days.findIndex((d) => d.id === a.lastCompletedDayId);
  return { today: null, next: days[(i + 1) % days.length]! };
}
