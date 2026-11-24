import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFS, formatTime, parseTime, planSchedule, restNotification, sanitizePrefs, toExpoWeekday, MAX_FOOD_REMINDERS, type NotificationPrefs } from '../src';

const now = new Date(2026, 10, 16, 10, 0).getTime(); // segunda 16 nov 2026, 10:00
const ctx = (o: Partial<Parameters<typeof planSchedule>[1]> = {}) => ({ planDays: [{ dayOfWeek: 1, name: 'Push' }, { dayOfWeek: 3, name: 'Pull' }, { dayOfWeek: null, name: 'Livre' }, { dayOfWeek: 1, name: 'Duplicado' }], lastWorkoutAt: null, now, ...o });
const on = (p: Partial<NotificationPrefs>): NotificationPrefs => ({ ...DEFAULT_PREFS, ...p });

describe('horas e dias', () => {
  it('parse/format', () => {
    expect(parseTime('7:05')).toEqual({ hour: 7, minute: 5 }); expect(parseTime('24:00')).toBeNull(); expect(parseTime('12:60')).toBeNull(); expect(parseTime('abc')).toBeNull();
    expect(formatTime(7, 5)).toBe('07:05');
  });
  it('dia da semana: nosso (1=segunda) → expo (1=domingo)', () => { expect(toExpoWeekday(1)).toBe(2); expect(toExpoWeekday(6)).toBe(7); expect(toExpoWeekday(7)).toBe(1); });
});

describe('preferências', () => {
  it('por defeito: só o aviso de descanso; nada de spam', () => {
    expect(planSchedule(DEFAULT_PREFS, ctx())).toEqual([]); expect(DEFAULT_PREFS.restTimer).toBe(true);
  });
  it('sanitiza lixo, limita lembretes e normaliza horas', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS); expect(sanitizePrefs('x')).toEqual(DEFAULT_PREFS);
    const p = sanitizePrefs({ restTimer: 'sim', workout: { enabled: true, time: '25:00' }, weighIn: { enabled: true, weekday: 9, time: '7:30' }, foodLog: { enabled: true, times: ['8:00', '08:00', '13:00', '20:00', '22:00', 'lixo'] }, inactivity: { enabled: true, days: 1 } });
    expect(p.restTimer).toBe(true); expect(p.workout.time).toBe('18:00'); expect(p.weighIn).toMatchObject({ weekday: 1, time: '07:30' });
    expect(p.foodLog.times).toEqual(['08:00', '13:00', '20:00']); expect(p.foodLog.times.length).toBeLessThanOrEqual(MAX_FOOD_REMINDERS); expect(p.inactivity.days).toBe(4);
  });
});

describe('lembretes', () => {
  it('treino: um por dia da semana definido (sem duplicados nem dias livres)', () => {
    const r = planSchedule(on({ workout: { enabled: true, time: '18:30' } }), ctx());
    expect(r.map((x) => x.id)).toEqual(['rem:workout:1', 'rem:workout:3']);
    expect(r[0]!.trigger).toEqual({ type: 'weekly', weekday: 2, hour: 18, minute: 30 }); expect(r[0]!.body).toContain('segunda-feira'); expect(r[0]!.body).toContain('Push');
    expect(planSchedule(on({ workout: { enabled: true, time: '18:00' } }), ctx({ planDays: [{ dayOfWeek: null, name: 'Flex' }] }))).toEqual([]);
  });
  it('pesagem semanal e registo alimentar diário', () => {
    const r = planSchedule(on({ weighIn: { enabled: true, weekday: 7, time: '08:15' }, foodLog: { enabled: true, times: ['13:00', '20:00'] } }), ctx());
    expect(r.find((x) => x.kind === 'weighIn')!.trigger).toEqual({ type: 'weekly', weekday: 1, hour: 8, minute: 15 });
    expect(r.filter((x) => x.kind === 'foodLog').map((x) => x.trigger)).toEqual([{ type: 'daily', hour: 13, minute: 0 }, { type: 'daily', hour: 20, minute: 0 }]);
  });
  it('inatividade: um único aviso N dias após o último treino, às 18h; nunca no passado', () => {
    const last = new Date(2026, 10, 14, 9, 0).getTime();
    const t = planSchedule(on({ inactivity: { enabled: true, days: 4 } }), ctx({ lastWorkoutAt: last }))[0]!.trigger as { at: number };
    expect(new Date(t.at).getDate()).toBe(18); expect(new Date(t.at).getHours()).toBe(18); expect(t.at).toBeGreaterThan(now);
    const old = planSchedule(on({ inactivity: { enabled: true, days: 4 } }), ctx({ lastWorkoutAt: new Date(2026, 9, 1).getTime() }))[0]!.trigger as { at: number };
    expect(new Date(old.at).getDate()).toBe(17); expect(old.at).toBeGreaterThan(now); // já passou o prazo → amanhã (e vai sendo adiado se abrires a app)
    expect(planSchedule(on({ inactivity: { enabled: true, days: 4 } }), ctx({ lastWorkoutAt: null }))).toHaveLength(1);
  });
  it('ids estáveis e únicos (reagendar é idempotente)', () => {
    const p = on({ workout: { enabled: true, time: '18:00' }, weighIn: { enabled: true, weekday: 1, time: '08:00' }, foodLog: { enabled: true, times: ['13:00', '20:00'] }, inactivity: { enabled: true, days: 3 } });
    const a = planSchedule(p, ctx()).map((x) => x.id), b = planSchedule(p, ctx()).map((x) => x.id);
    expect(a).toEqual(b); expect(new Set(a).size).toBe(a.length); expect(a.every((i) => i.startsWith('rem:'))).toBe(true);
  });
});

describe('descanso', () => {
  it('só agenda se estiver ativo e ainda for futuro', () => {
    expect(restNotification({ restTimer: true }, now + 90_000, now)).toMatchObject({ id: 'rest-timer', at: now + 90_000 });
    expect(restNotification({ restTimer: false }, now + 90_000, now)).toBeNull();
    expect(restNotification({ restTimer: true }, now + 500, now)).toBeNull();
    expect(restNotification({ restTimer: true }, now - 5000, now)).toBeNull();
  });
});
