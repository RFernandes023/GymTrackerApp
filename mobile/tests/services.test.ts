import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-file-system/legacy', () => ({}));
import { isValidBarcode, lookupBarcode, searchOnline } from '../services/openFoodFacts';
import { isExpired, TEMP_MAX_AGE_MS } from '../services/tempFiles';

const resp = (body: any, ok = true, status = 200) => async () => ({ ok, status, json: async () => body }) as any;
const product = { code: '5601234567890', product_name: 'Aveia', nutriments: { 'energy-kcal_100g': 370, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7 } };

describe('Open Food Facts (cliente)', () => {
  it('valida código de barras (bloqueia injeção no URL)', () => {
    expect(isValidBarcode('5601234567890')).toBe(true);
    expect(isValidBarcode('123')).toBe(false);
    expect(isValidBarcode('560123456789a')).toBe(false);
    expect(isValidBarcode('../../etc')).toBe(false);
  });
  it('encontrado', async () => {
    const r = await lookupBarcode('5601234567890', resp({ status: 1, product }));
    expect(r.status).toBe('found'); if (r.status === 'found') expect(r.draft.per100.kcal).toBe(370);
  });
  it('não existe / incompleto / offline / erro', async () => {
    expect((await lookupBarcode('5601234567890', resp({ status: 0 }))).status).toBe('not_found');
    expect((await lookupBarcode('5601234567890', resp({}, false, 404))).status).toBe('not_found');
    expect((await lookupBarcode('5601234567890', resp({ status: 1, product: { product_name: 'X', nutriments: {} } }))).status).toBe('incomplete');
    expect((await lookupBarcode('5601234567890', (async () => { throw new TypeError('Network request failed'); }) as any)).status).toBe('offline');
    expect((await lookupBarcode('5601234567890', resp({}, false, 500))).status).toBe('error');
    expect((await lookupBarcode('abc')).status).toBe('error');
  });
  it('pesquisa ignora produtos incompletos; offline não rebenta', async () => {
    const r = await searchOnline('aveia', resp({ products: [product, { product_name: 'Sem dados' }] }));
    expect(r.status === 'ok' && r.drafts.length).toBe(1);
    expect((await searchOnline('aveia', (async () => { throw new Error('x'); }) as any)).status).toBe('offline');
    expect(await searchOnline('a')).toEqual({ status: 'ok', drafts: [] });
  });
  it('pedido usa o código no caminho e User-Agent', async () => {
    const f = vi.fn((..._a: unknown[]) => resp({ status: 0 })());
    await lookupBarcode('5601234567890', f as any);
    expect(f.mock.calls[0]![0]).toContain('/api/v2/product/5601234567890.json');
    expect((f.mock.calls[0]![1] as any).headers['User-Agent']).toMatch(/GymNutritionTracker/);
  });
});

describe('limpeza de temporários', () => {
  const now = 1_800_000_000_000;
  it('expira após 7 dias', () => {
    expect(isExpired((now - TEMP_MAX_AGE_MS - 1000) / 1000, now)).toBe(true);
    expect(isExpired((now - TEMP_MAX_AGE_MS + 60_000) / 1000, now)).toBe(false);
    expect(isExpired(undefined, now)).toBe(true);
  });
});
