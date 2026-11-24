export type ReminderKind = 'workout' | 'weighIn' | 'foodLog' | 'inactivity';

export interface NotificationPrefs {
  /** Aviso do fim do descanso entre séries (funciona com o ecrã bloqueado). */
  restTimer: boolean;
  workout: { enabled: boolean; time: string };
  weighIn: { enabled: boolean; weekday: number; time: string };
  foodLog: { enabled: boolean; times: string[] };
  inactivity: { enabled: boolean; days: number };
}

export const DEFAULT_PREFS: NotificationPrefs = {
  restTimer: true,
  workout: { enabled: false, time: '18:00' },
  weighIn: { enabled: false, weekday: 1, time: '08:00' },
  foodLog: { enabled: false, times: ['20:30'] },
  inactivity: { enabled: false, days: 4 },
};

export const MAX_FOOD_REMINDERS = 3; // evita notificações excessivas

export function parseTime(t: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim()); if (!m) return null;
  const hour = Number(m[1]), minute = Number(m[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : null;
}
export const formatTime = (hour: number, minute: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** Aceita preferências guardadas (possivelmente antigas/corrompidas) e devolve sempre valores válidos. */
export function sanitizePrefs(raw: unknown): NotificationPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any; const d = DEFAULT_PREFS;
  const time = (v: unknown, fb: string) => (typeof v === 'string' && parseTime(v) ? formatTime(parseTime(v)!.hour, parseTime(v)!.minute) : fb);
  const times = Array.isArray(r.foodLog?.times) ? [...new Set<string>(r.foodLog.times.filter((x: unknown) => typeof x === 'string' && parseTime(x)).map((x: string) => formatTime(parseTime(x)!.hour, parseTime(x)!.minute)))].slice(0, MAX_FOOD_REMINDERS) : d.foodLog.times;
  const days = Number.isInteger(r.inactivity?.days) && r.inactivity.days >= 2 && r.inactivity.days <= 30 ? r.inactivity.days : d.inactivity.days;
  const wd = Number.isInteger(r.weighIn?.weekday) && r.weighIn.weekday >= 1 && r.weighIn.weekday <= 7 ? r.weighIn.weekday : d.weighIn.weekday;
  return {
    restTimer: typeof r.restTimer === 'boolean' ? r.restTimer : d.restTimer,
    workout: { enabled: r.workout?.enabled === true, time: time(r.workout?.time, d.workout.time) },
    weighIn: { enabled: r.weighIn?.enabled === true, weekday: wd, time: time(r.weighIn?.time, d.weighIn.time) },
    foodLog: { enabled: r.foodLog?.enabled === true, times: times.length ? times : d.foodLog.times },
    inactivity: { enabled: r.inactivity?.enabled === true, days },
  };
}

export type Trigger = { type: 'weekly'; weekday: number; hour: number; minute: number } | { type: 'daily'; hour: number; minute: number } | { type: 'date'; at: number };
export interface ScheduledItem { id: string; kind: ReminderKind; title: string; body: string; trigger: Trigger }

/** O nosso 1=segunda … 7=domingo → expo 1=domingo … 7=sábado. */
export const toExpoWeekday = (n: number) => (n === 7 ? 1 : n + 1);
const DAY_NAMES = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];

export interface ScheduleContext { planDays: { dayOfWeek: number | null; name: string }[]; lastWorkoutAt: number | null; now: number }

/**
 * Calcula TODOS os lembretes a agendar (o chamador cancela os antigos e agenda estes: idempotente).
 * - treino: um lembrete semanal por dia da semana definido no plano ativo (planos flexíveis não têm lembretes fixos);
 * - pesagem: semanal; registo alimentar: diário (máx. 3);
 * - inatividade: UM aviso único, `days` dias depois do último treino (ou amanhã às 18h se já passou esse prazo);
 *   como é reagendado sempre que abres a app, só dispara se realmente deixares de abrir/treinar.
 */
export function planSchedule(prefs: NotificationPrefs, ctx: ScheduleContext): ScheduledItem[] {
  const out: ScheduledItem[] = [];
  if (prefs.workout.enabled) {
    const t = parseTime(prefs.workout.time)!;
    const seen = new Set<number>();
    for (const d of ctx.planDays) {
      if (d.dayOfWeek == null || seen.has(d.dayOfWeek)) continue; seen.add(d.dayOfWeek);
      out.push({ id: `rem:workout:${d.dayOfWeek}`, kind: 'workout', title: 'Hora de treinar 💪', body: `Hoje é ${DAY_NAMES[d.dayOfWeek]}: ${d.name}.`, trigger: { type: 'weekly', weekday: toExpoWeekday(d.dayOfWeek), hour: t.hour, minute: t.minute } });
    }
  }
  if (prefs.weighIn.enabled) {
    const t = parseTime(prefs.weighIn.time)!;
    out.push({ id: 'rem:weighIn', kind: 'weighIn', title: 'Pesagem semanal', body: 'Regista o teu peso para acompanhares a evolução.', trigger: { type: 'weekly', weekday: toExpoWeekday(prefs.weighIn.weekday), hour: t.hour, minute: t.minute } });
  }
  if (prefs.foodLog.enabled) {
    prefs.foodLog.times.slice(0, MAX_FOOD_REMINDERS).forEach((s, i) => { const t = parseTime(s); if (t) out.push({ id: `rem:foodLog:${i}`, kind: 'foodLog', title: 'Registo alimentar', body: 'Já registaste as tuas refeições de hoje?', trigger: { type: 'daily', hour: t.hour, minute: t.minute } }); });
  }
  if (prefs.inactivity.enabled) {
    const DAY = 86_400_000;
    const at18 = (ms: number) => { const d = new Date(ms); d.setHours(18, 0, 0, 0); return d.getTime(); };
    const base = ctx.lastWorkoutAt ?? ctx.now;
    let at = at18(base + prefs.inactivity.days * DAY);
    if (at <= ctx.now) at = at18(ctx.now + DAY);
    out.push({ id: 'rem:inactivity', kind: 'inactivity', title: 'Sentimos a tua falta', body: `Já passaram ${prefs.inactivity.days} dias ou mais desde o último treino. Que tal voltar hoje?`, trigger: { type: 'date', at } });
  }
  return out;
}

export const REST_NOTIFICATION_ID = 'rest-timer';
/** Notificação do fim do descanso (null se já passou ou está desligada). */
export function restNotification(prefs: Pick<NotificationPrefs, 'restTimer'>, endsAt: number, now: number) {
  if (!prefs.restTimer || endsAt <= now + 1000) return null;
  return { id: REST_NOTIFICATION_ID, title: 'Descanso terminado', body: 'Próxima série! 💪', at: endsAt };
}
