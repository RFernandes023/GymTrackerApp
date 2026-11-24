import { describe, it, expect } from 'vitest';
import { nextTarget, restAfter, type FlowExercise } from '../src';

const set = (id: string, completed = false, type: any = 'working', rest = 90) => ({ id, completed, type, restSeconds: rest });

describe('fluxo do treino', () => {
  it('sequencial: primeira série por fazer', () => {
    const ex: FlowExercise[] = [
      { id: 'A', supersetGroup: null, sets: [set('a1', true), set('a2')] },
      { id: 'B', supersetGroup: null, sets: [set('b1')] },
    ];
    expect(nextTarget(ex)).toEqual({ exerciseId: 'A', setId: 'a2' });
  });
  it('fim do treino → null', () => {
    expect(nextTarget([{ id: 'A', supersetGroup: null, sets: [set('a1', true)] }])).toBeNull();
  });
  it('superset alterna A, B, A, B', () => {
    const ex: FlowExercise[] = [
      { id: 'A', supersetGroup: 'g', sets: [set('a1'), set('a2')] },
      { id: 'B', supersetGroup: 'g', sets: [set('b1'), set('b2')] },
    ];
    const order: string[] = [];
    for (let t = nextTarget(ex); t; t = nextTarget(ex)) {
      order.push(t.setId);
      ex.find((e) => e.id === t!.exerciseId)!.sets.find((s) => s.id === t!.setId)!.completed = true;
    }
    expect(order).toEqual(['a1', 'b1', 'a2', 'b2']);
  });
  it('superset: sem descanso até fechar a ronda', () => {
    const ex: FlowExercise[] = [
      { id: 'A', supersetGroup: 'g', sets: [set('a1', true), set('a2')] },
      { id: 'B', supersetGroup: 'g', sets: [set('b1'), set('b2')] },
    ];
    expect(restAfter(ex, 'A', 'a1')).toBe(0);
    ex[1]!.sets[0]!.completed = true;
    expect(restAfter(ex, 'B', 'b1')).toBe(90);
  });
  it('antes de uma drop set não há descanso', () => {
    const ex: FlowExercise[] = [{ id: 'A', supersetGroup: null, sets: [set('a1', true), set('a2', false, 'drop')] }];
    expect(restAfter(ex, 'A', 'a1')).toBe(0);
  });
  it('descanso normal', () => {
    const ex: FlowExercise[] = [{ id: 'A', supersetGroup: null, sets: [set('a1', true, 'working', 120), set('a2')] }];
    expect(restAfter(ex, 'A', 'a1')).toBe(120);
  });
});
