export type LabelBasis = 'per100g' | 'per100ml' | 'perServing' | 'perUnit';
export interface LabelValues { kcal: number | null; fat: number | null; satFat: number | null; carbs: number | null; sugars: number | null; protein: number | null; fiber: number | null; salt: number | null }
export interface LabelResult { basis: LabelBasis | null; servingSize: number | null; values: LabelValues; warnings: string[] }

const strip = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
const toNum = (s: string) => Number(s.replace(',', '.'));

export interface OcrLine { text: string; frame?: { top: number; left: number; height: number; width?: number } }

/** Agrupa linhas do OCR em linhas visuais (tabelas aparecem como etiqueta + valor em blocos separados). */
export function groupRows(lines: OcrLine[]): string[] {
  if (lines.some((l) => !l.frame)) return lines.map((l) => l.text);
  const sorted = [...lines].sort((a, b) => a.frame!.top + a.frame!.height / 2 - (b.frame!.top + b.frame!.height / 2));
  const heights = sorted.map((l) => l.frame!.height).sort((a, b) => a - b);
  const tol = (heights[Math.floor(heights.length / 2)] ?? 20) * 0.6;
  const rows: OcrLine[][] = [];
  for (const l of sorted) {
    const cy = l.frame!.top + l.frame!.height / 2;
    const last = rows.at(-1);
    const lastCy = last ? last[0]!.frame!.top + last[0]!.frame!.height / 2 : null;
    if (last && lastCy !== null && Math.abs(cy - lastCy) <= tol) last.push(l); else rows.push([l]);
  }
  return rows.map((r) => r.sort((a, b) => a.frame!.left - b.frame!.left).map((l) => l.text).join(' '));
}

interface Num { value: number; unit: string; approx: boolean }
function numbersIn(row: string): Num[] {
  const out: Num[] = [];
  for (const m of row.matchAll(/(<)?\s*(\d+(?:[.,]\d+)?)\s*(kj|kcal|mg|mcg|g|%)?/g)) out.push({ value: toNum(m[2]!), unit: m[3] ?? '', approx: !!m[1] });
  return out;
}
const gramsOf = (nums: Num[]): Num | null => {
  const ok = nums.filter((n) => n.unit === 'g' || n.unit === 'mg' || n.unit === '');
  return ok.find((n) => n.unit === 'g') ?? ok[0] ?? null;
};

type Key = keyof LabelValues;
const MATCHERS: [Key, RegExp][] = [
  ['satFat', /saturad|saturates|\bsatur/], ['sugars', /acucar|sugar/], ['fiber', /fibra|fibre|fiber/], ['protein', /proteina|protein/],
  ['salt', /\bsal\b|\bsalt\b/], ['carbs', /hidrato|carboidrato|carbohydrate|\bcarbs\b/], ['fat', /\blipido|\bgordura|\bfat\b|\btotal fat/], ['kcal', /energ|\bcalor|kcal/],
];
const SKIP_FAT = /monoinsat|poliinsat|polyunsat|monounsat|\btrans\b/;

export function parseNutritionLabel(inputRows: string[]): LabelResult {
  const rows = inputRows.map(strip).filter(Boolean);
  const text = rows.join(' \n ');
  const warnings: string[] = [];
  const values: LabelValues = { kcal: null, fat: null, satFat: null, carbs: null, sugars: null, protein: null, fiber: null, salt: null };

  let basis: LabelBasis | null = null;
  const has100ml = /100\s?ml/.test(text), has100g = /100\s?g\b/.test(text);
  const hasServing = /por\s*(dose|porcao|serving)|per\s*serving|\bdose\b|\bporcao\b/.test(text);
  if (has100ml) basis = 'per100ml'; else if (has100g) basis = 'per100g'; else if (hasServing) basis = 'perServing'; else if (/por\s*unidade|per\s*unit|\bunidade\b/.test(text)) basis = 'perUnit';
  if ((has100g || has100ml) && hasServing) warnings.push('Foram detetadas várias colunas (por 100 g/ml e por dose). Usou-se a primeira; confirma os valores.');
  if (!basis) warnings.push('Não foi possível identificar a base dos valores (100 g, 100 ml, dose ou unidade). Escolhe manualmente.');

  const sv = text.match(/(?:dose|porcao|serving)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:g|ml)\b/);
  const servingSize = sv ? toNum(sv[1]!) : null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const hit = MATCHERS.find(([k, re]) => re.test(row) && !(k === 'fat' && SKIP_FAT.test(row)));
    if (!hit) continue;
    const key = hit[0];
    if (values[key] !== null) continue;
    let nums = numbersIn(row);
    if (key === 'kcal') {
      const kc = [...row.matchAll(/(\d+(?:[.,]\d+)?)\s*kcal/g)].map((m) => toNum(m[1]!));
      if (kc.length) { values.kcal = kc[0]!; continue; }
      const kj = [...row.matchAll(/(\d+(?:[.,]\d+)?)\s*kj/g)].map((m) => toNum(m[1]!));
      if (kj.length) { values.kcal = Math.round(kj[0]! / 4.184); warnings.push('Só foi encontrado o valor em kJ; as kcal foram calculadas (÷ 4,184).'); continue; }
    }
    if (nums.filter((n) => n.unit !== '%').length === 0) { // etiqueta sem valor: tenta a linha seguinte (só números)
      const next = rows[i + 1];
      if (next && !MATCHERS.some(([, re]) => re.test(next))) nums = numbersIn(next);
    }
    if (key === 'kcal') { const n = nums.find((x) => x.unit === '' ); if (n) values.kcal = n.value; continue; }
    const n = gramsOf(nums.filter((x) => x.unit !== '%' && x.unit !== 'kj' && x.unit !== 'kcal'));
    if (!n) continue;
    values[key] = n.unit === 'mg' ? n.value / 1000 : n.value;
    if (n.approx) warnings.push(`Valor aproximado (“<”) em ${key}; confirma.`);
  }
  if (values.kcal === null) warnings.push('Não foram encontradas as calorias.');
  return { basis, servingSize, values, warnings };
}

/** Converte valores lidos para "por 100 g/ml" quando a base é uma dose (precisa do tamanho da dose). */
export function labelToPer100(values: LabelValues, basis: LabelBasis, servingSize: number | null): LabelValues | null {
  if (basis === 'per100g' || basis === 'per100ml') return values;
  if (!servingSize || servingSize <= 0) return null;
  const k = 100 / servingSize;
  const f = (n: number | null) => (n === null ? null : Math.round(n * k * 10) / 10);
  return { kcal: f(values.kcal), fat: f(values.fat), satFat: f(values.satFat), carbs: f(values.carbs), sugars: f(values.sugars), protein: f(values.protein), fiber: f(values.fiber), salt: f(values.salt) };
}
