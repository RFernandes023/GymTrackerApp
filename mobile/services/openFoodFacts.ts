import { mapOffProduct, type FoodDraft } from '@gym/shared';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_pt,generic_name,generic_name_pt,brands,quantity,serving_size,serving_quantity,product_quantity_unit,nutriments';
/** O Open Food Facts pede um User-Agent identificável. Configurar EXPO_PUBLIC_OFF_CONTACT (email/URL do projeto). */
const UA = `GymNutritionTracker/0.3 (${process.env.EXPO_PUBLIC_OFF_CONTACT ?? 'contacto-por-configurar'})`;
const TIMEOUT_MS = 8000;

export type Lookup =
  | { status: 'found'; draft: FoodDraft }
  | { status: 'not_found' }
  | { status: 'incomplete' } // existe no OFF mas sem dados nutricionais suficientes
  | { status: 'offline' }
  | { status: 'error' };

export const isValidBarcode = (s: string) => /^\d{8,14}$/.test(s.trim());

async function getJson(url: string, fetchImpl: typeof fetch): Promise<{ ok: true; json: any } | { ok: false; offline: boolean; status?: number }> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return { ok: false, offline: false, status: res.status };
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, offline: true }; // sem rede, DNS, timeout
  } finally { clearTimeout(t); }
}

export async function lookupBarcode(barcode: string, fetchImpl: typeof fetch = fetch): Promise<Lookup> {
  const code = barcode.trim();
  if (!isValidBarcode(code)) return { status: 'error' };
  const r = await getJson(`${BASE}/api/v2/product/${code}.json?fields=${FIELDS}`, fetchImpl);
  if (!r.ok) return r.status === 404 ? { status: 'not_found' } : r.offline ? { status: 'offline' } : { status: 'error' };
  if (r.json?.status !== 1 || !r.json.product) return { status: 'not_found' };
  const draft = mapOffProduct({ ...r.json.product, code: r.json.product.code ?? code });
  return draft ? { status: 'found', draft } : { status: 'incomplete' };
}

export type SearchResult = { status: 'ok'; drafts: FoodDraft[] } | { status: 'offline' } | { status: 'error' };

export async function searchOnline(query: string, fetchImpl: typeof fetch = fetch): Promise<SearchResult> {
  const q = query.trim();
  if (q.length < 2) return { status: 'ok', drafts: [] };
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
  const r = await getJson(url, fetchImpl);
  if (!r.ok) return r.offline ? { status: 'offline' } : { status: 'error' };
  const drafts = (Array.isArray(r.json?.products) ? r.json.products : []).map(mapOffProduct).filter((d: FoodDraft | null): d is FoodDraft => !!d);
  return { status: 'ok', drafts };
}
