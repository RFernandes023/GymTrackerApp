import { describe, it, expect } from 'vitest';
import { EMPTY_MANIFEST, cleanMediaFileName, frameIndex, matchMediaFiles, mediaUrl } from '../src';

describe('URL da animação', () => {
  const m = { baseUrl: 'https://cdn.exemplo.pt/gifs/', credit: '© X', files: { a: 'bench press.gif', b: 'pasta/a b.gif', c: 'https://outro.pt/c.gif' } };
  it('junta a base, codifica e respeita URLs absolutos', () => {
    expect(mediaUrl(m, 'a')).toBe('https://cdn.exemplo.pt/gifs/bench%20press.gif');
    expect(mediaUrl(m, 'b')).toBe('https://cdn.exemplo.pt/gifs/pasta/a%20b.gif');
    expect(mediaUrl(m, 'c')).toBe('https://outro.pt/c.gif');
  });
  it('sem ficheiro ou sem base → null', () => {
    expect(mediaUrl(m, 'zzz')).toBeNull(); expect(mediaUrl(EMPTY_MANIFEST, 'a')).toBeNull();
    expect(mediaUrl({ baseUrl: null, credit: null, files: { a: 'x.gif' } }, 'a')).toBeNull();
  });
});

describe('casar ficheiros com exercícios', () => {
  it('limpa nomes de ficheiro', () => {
    expect(cleanMediaFileName('0123-Barbell_Bench-Press_180x180.gif')).toBe('Barbell Bench Press');
    expect(cleanMediaFileName('pasta/Lat Pulldown (wide).GIF')).toBe('Lat Pulldown wide');
  });
  const ex = [{ id: 'bench', names: ['Supino plano com barra', 'Barbell Bench Press'] }, { id: 'squat', names: ['Agachamento com barra', 'Barbell Squat'] }, { id: 'curl', names: ['Rosca direta', 'Barbell Curl'] }];
  it('casa por PT/EN, escolhe o melhor duplicado e lista o que sobra', () => {
    const r = matchMediaFiles(['001-barbell-bench-press.gif', 'barbell_squat_180x180.gif', 'barbell bench press 2.gif', 'yoga-pose.gif', 'Rosca direta.webp'], ex);
    expect(r.matches.map((m) => m.exerciseId).sort()).toEqual(['bench', 'curl', 'squat']);
    expect(r.unmatched).toEqual(['yoga-pose.gif']);
    expect(r.duplicates).toHaveLength(1); expect(r.duplicates[0]!.exerciseId).toBe('bench');
    expect(r.matches[0]!.score).toBeLessThanOrEqual(r.matches.at(-1)!.score); // ordenado dos mais duvidosos para os mais seguros (para revisão)
  });
  it('limiar evita casamentos fracos', () => expect(matchMediaFiles(['leg press.gif'], ex).matches).toEqual([]));
});

describe('animação por fotogramas', () => {
  it('alterna 0,1,0,1 a cada período; 1 imagem fica fixa', () => {
    expect([0, 899, 900, 1800].map((t) => frameIndex(t, 2))).toEqual([0, 0, 1, 0]);
    expect(frameIndex(5000, 1)).toBe(0); expect(frameIndex(2700, 3)).toBe(0); expect(frameIndex(1800, 3)).toBe(2);
  });
});
