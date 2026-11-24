import { describe, it, expect } from 'vitest';
import { defaultLayout, move, reconcile, setEnabled } from './layout';

const enabledOrder = (l: ReturnType<typeof defaultLayout>) => l.filter((c) => c.enabled).map((c) => c.type);

describe('dashboard layout', () => {
  it('layout por defeito tem posições contíguas e cartões ativos primeiro', () => {
    const l = defaultLayout();
    expect(l.map((c) => c.position)).toEqual(l.map((_, i) => i));
    const firstDisabled = l.findIndex((c) => !c.enabled);
    expect(l.slice(firstDisabled).every((c) => !c.enabled)).toBe(true);
  });
  it('move troca com o vizinho', () => {
    const l = defaultLayout();
    const [a, b] = enabledOrder(l);
    expect(enabledOrder(move(l, a!, 1)).slice(0, 2)).toEqual([b, a]);
  });
  it('move nos limites não faz nada', () => {
    const l = defaultLayout();
    expect(move(l, enabledOrder(l)[0]!, -1)).toBe(l);
  });
  it('desativar remove dos ativos; ativar coloca no fim dos ativos', () => {
    let l = defaultLayout();
    const first = enabledOrder(l)[0]!;
    l = setEnabled(l, first, false);
    expect(enabledOrder(l)).not.toContain(first);
    l = setEnabled(l, first, true);
    expect(enabledOrder(l).at(-1)).toBe(first);
  });
  it('reconcile acrescenta tipos novos e remove desconhecidos', () => {
    const l = reconcile([{ type: 'bmi', position: 0, enabled: true }, { type: 'inexistente', position: 1, enabled: true }]);
    expect(l.find((c) => c.type === 'inexistente')).toBeUndefined();
    expect(l.find((c) => c.type === 'bmi')?.enabled).toBe(true);
    expect(l.length).toBeGreaterThan(10);
  });
});
