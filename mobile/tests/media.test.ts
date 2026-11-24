import { describe, expect, it } from 'vitest';
import { EMPTY_MANIFEST } from '@gym/shared';
import { resolveMedia } from '../features/workouts/media';

const ex = (o: Partial<{ id: string; images: string[]; isCustom: boolean }> = {}) => ({ id: 'ffd:Pullups', images: ['Pullups/0.jpg', 'Pullups/1.jpg'], isCustom: false, ...o });

describe('escolha da média do exercício', () => {
  it('sem manifesto: 2 fotogramas do Free Exercise DB (animam início ↔ fim)', () => {
    const m = resolveMedia(ex(), EMPTY_MANIFEST);
    expect(m).toMatchObject({ kind: 'frames' });
    if (m?.kind === 'frames') { expect(m.uris).toHaveLength(2); expect(m.uris[0]).toContain('Pullups/0.jpg'); }
  });
  it('com animação no manifesto: GIF (e crédito); tem prioridade sobre os fotogramas', () => {
    const m = resolveMedia(ex(), { baseUrl: 'https://cdn.x/g', credit: '© Gym visual — https://gymvisual.com/', files: { 'ffd:Pullups': 'pullups.gif' } });
    expect(m).toEqual({ kind: 'gif', uri: 'https://cdn.x/g/pullups.gif', credit: '© Gym visual — https://gymvisual.com/' });
  });
  it('manifesto sem base nem URL absoluto cai para os fotogramas', () => {
    expect(resolveMedia(ex(), { baseUrl: null, credit: null, files: { 'ffd:Pullups': 'x.gif' } })?.kind).toBe('frames');
  });
  it('personalizado ou sem imagens → sem média (nunca a de outro exercício)', () => {
    expect(resolveMedia(ex({ isCustom: true }), EMPTY_MANIFEST)).toBeNull();
    expect(resolveMedia(ex({ images: [] }), EMPTY_MANIFEST)).toBeNull();
  });
  it('um exercício personalizado pode ter animação no manifesto se tu a atribuíres', () => {
    expect(resolveMedia(ex({ id: 'custom-1', isCustom: true }), { baseUrl: 'https://c', credit: null, files: { 'custom-1': 'a.gif' } })?.kind).toBe('gif');
  });
});
