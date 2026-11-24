import { describe, it, expect } from 'vitest';
import { pickWorkouts } from '../src';

const d = (id: string, dow: number | null, position: number) => ({ id, name: id, dayOfWeek: dow, position });
describe('agenda', () => {
  const days = [d('A', 1, 0), d('B', 3, 1), d('C', 5, 2)];
  it('hoje marcado', () => expect(pickWorkouts({ days, todayDow: 3, lastCompletedDayId: null, trainedTodayDayIds: [] })).toMatchObject({ today: { id: 'B' }, next: { id: 'B' } }));
  it('hoje já treinado → próximo é o seguinte', () => expect(pickWorkouts({ days, todayDow: 3, lastCompletedDayId: 'B', trainedTodayDayIds: ['B'] }).next!.id).toBe('C'));
  it('dia livre → próximo dia marcado, sem treino de hoje', () => expect(pickWorkouts({ days, todayDow: 4, lastCompletedDayId: null, trainedTodayDayIds: [] })).toMatchObject({ today: null, next: { id: 'C' } }));
  it('volta ao início da semana', () => expect(pickWorkouts({ days, todayDow: 6, lastCompletedDayId: null, trainedTodayDayIds: [] }).next!.id).toBe('A'));
  it('plano flexível: rotação', () => {
    const f = [d('X', null, 0), d('Y', null, 1)];
    expect(pickWorkouts({ days: f, todayDow: 2, lastCompletedDayId: 'X', trainedTodayDayIds: [] }).next!.id).toBe('Y');
    expect(pickWorkouts({ days: f, todayDow: 2, lastCompletedDayId: 'Y', trainedTodayDayIds: [] }).next!.id).toBe('X');
    expect(pickWorkouts({ days: f, todayDow: 2, lastCompletedDayId: null, trainedTodayDayIds: [] }).next!.id).toBe('X');
  });
  it('sem dias', () => expect(pickWorkouts({ days: [], todayDow: 1, lastCompletedDayId: null, trainedTodayDayIds: [] })).toEqual({ today: null, next: null }));
});
