import { describe, it, expect } from 'vitest';
import { amountInBase, availableUnits, scaleNutrition, sumMacros, validatePer100, energyFromMacros, addDays, toDateKey, isDateKey, recipeTotals, perServing, scaleMacros, mapOffProduct, parseNutritionLabel, groupRows, labelToPer100 } from '../src';

const oats = { per100: { kcal: 370, protein: 13, carbs: 60, fat: 7, fiber: 10 }, baseUnit: 'g' as const, servingSize: 40, unitWeight: null };

describe('conversões e escala', () => {
  it('g, dose, unidade', () => {
    expect(amountInBase(oats, 50, 'g')).toBe(50);
    expect(amountInBase(oats, 2, 'serving')).toBe(80);
    expect(amountInBase(oats, 1, 'unit')).toBeNull();
    expect(amountInBase({ ...oats, unitWeight: 60 }, 2, 'unit')).toBe(120);
    expect(amountInBase(oats, 100, 'ml')).toBeNull();
    expect(amountInBase(oats, 0, 'g')).toBeNull();
    expect(availableUnits(oats)).toEqual(['g', 'serving']);
  });
  it('escala macros por quantidade', () => {
    expect(scaleNutrition(oats.per100, 80)).toEqual({ kcal: 296, protein: 10.4, carbs: 48, fat: 5.6, fiber: 8 });
  });
  it('soma sem erros de vírgula flutuante', () => {
    expect(sumMacros([{ kcal: 0.1, protein: 0.2, carbs: 0, fat: 0, fiber: 0 }, { kcal: 0.2, protein: 0.1, carbs: 0, fat: 0, fiber: 0 }])).toMatchObject({ kcal: 0.3, protein: 0.3 });
  });
  it('energia dos macros', () => expect(energyFromMacros(10, 20, 5)).toBe(165));
});

describe('validação de valores por 100 g', () => {
  it('aceita válido', () => expect(validatePer100({ kcal: 250, protein: 10, carbs: 30, fat: 9, satFat: 3, sugars: 5 }).errors).toEqual([]));
  it('bloqueia impossíveis', () => {
    expect(validatePer100({ kcal: 1200, protein: 1, carbs: 1, fat: 1 }).errors.length).toBe(1);
    expect(validatePer100({ kcal: 500, protein: 60, carbs: 50, fat: 20 }).errors[0]).toMatch(/excedem 100/);
    expect(validatePer100({ kcal: -1, protein: 1, carbs: 1, fat: 1 }).errors[0]).toMatch(/inválido/i);
  });
  it('avisa incoerência de energia e saturados', () => {
    const w = validatePer100({ kcal: 500, protein: 5, carbs: 10, fat: 2, satFat: 5 }).warnings.join(' ');
    expect(w).toMatch(/saturadas/); expect(w).toMatch(/diferem/);
  });
});

describe('datas e receitas', () => {
  it('chaves de dia', () => {
    expect(toDateKey(new Date(2026, 10, 15, 23, 59).getTime())).toBe('2026-11-15');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isDateKey('2026-02-30')).toBe(false); expect(isDateKey('2026-11-15')).toBe(true); expect(isDateKey('15/11/2026')).toBe(false);
  });
  it('receita: totais e por dose', () => {
    const t = recipeTotals([{ kcal: 300, protein: 20, carbs: 30, fat: 10, fiber: 3 }, { kcal: 150, protein: 5, carbs: 20, fat: 5, fiber: 2 }]);
    expect(t.kcal).toBe(450);
    expect(perServing(t, 3)).toMatchObject({ kcal: 150, protein: 8.3, fiber: 1.7 });
    expect(() => perServing(t, 0)).toThrow();
    expect(scaleMacros(perServing(t, 3), 2).kcal).toBe(300);
  });
});

describe('Open Food Facts', () => {
  const product = { code: '5601234567890', product_name: 'Aveia em flocos', brands: 'Marca X, Outra', serving_quantity: '40', serving_size: '40 g',
    nutriments: { 'energy-kcal_100g': 372, proteins_100g: 13.5, carbohydrates_100g: 58, fat_100g: 7, 'saturated-fat_100g': 1.3, sugars_100g: 1, fiber_100g: 10, salt_100g: 0.01 } };
  it('mapeia produto completo', () => {
    expect(mapOffProduct(product)).toMatchObject({ name: 'Aveia em flocos', brand: 'Marca X', barcode: '5601234567890', baseUnit: 'g', servingSize: 40, per100: { kcal: 372, protein: 13.5, fiber: 10 } });
  });
  it('kJ → kcal quando falta kcal', () => expect(mapOffProduct({ ...product, nutriments: { 'energy-kj_100g': 1046, proteins_100g: 5 } })!.per100.kcal).toBe(250));
  it('líquidos em ml', () => expect(mapOffProduct({ ...product, serving_size: '250 ml', serving_quantity: 250 })!.baseUnit).toBe('ml'));
  it('dados insuficientes → null', () => {
    expect(mapOffProduct({ product_name: 'X', nutriments: {} })).toBeNull();
    expect(mapOffProduct({ nutriments: { 'energy-kcal_100g': 100, proteins_100g: 1 } })).toBeNull();
    expect(mapOffProduct(null)).toBeNull();
  });
});

describe('OCR de rótulos', () => {
  it('tabela PT por 100 g', () => {
    const r = parseNutritionLabel(['Informação nutricional', 'Por 100 g', 'Valor energético 1046 kJ / 250 kcal', 'Lípidos 12 g', 'dos quais saturados 3,6 g', 'Hidratos de carbono 28 g', 'dos quais açúcares 5,2 g', 'Fibra 2,5 g', 'Proteínas 7,5 g', 'Sal 1,1 g']);
    expect(r.basis).toBe('per100g');
    expect(r.values).toEqual({ kcal: 250, fat: 12, satFat: 3.6, carbs: 28, sugars: 5.2, protein: 7.5, fiber: 2.5, salt: 1.1 });
    expect(r.warnings).toEqual([]);
  });
  it('inglês e ml', () => {
    const r = parseNutritionLabel(['Nutrition facts per 100 ml', 'Energy 180kJ/43kcal', 'Fat 0.5 g', 'of which saturates 0.1 g', 'Carbohydrate 9.8 g', 'of which sugars 9.6 g', 'Protein 0.7 g', 'Salt 0.02 g']);
    expect(r.basis).toBe('per100ml');
    expect(r.values).toMatchObject({ kcal: 43, fat: 0.5, satFat: 0.1, carbs: 9.8, sugars: 9.6, protein: 0.7, salt: 0.02 });
  });
  it('etiqueta e valor em linhas separadas', () => {
    const r = parseNutritionLabel(['por 100 g', 'Lípidos', '12 g', 'Proteínas', '7 g', 'Energia 100 kcal']);
    expect(r.values).toMatchObject({ fat: 12, protein: 7, kcal: 100 });
  });
  it('só kJ → converte com aviso; mg de sal; "<"', () => {
    const r = parseNutritionLabel(['por 100 g', 'Energia 1046 kJ', 'Sal 450 mg', 'Fibra <0,5 g']);
    expect(r.values.kcal).toBe(250); expect(r.values.salt).toBe(0.45); expect(r.values.fiber).toBe(0.5);
    expect(r.warnings.join(' ')).toMatch(/kJ/); expect(r.warnings.join(' ')).toMatch(/aproximado/);
  });
  it('duas colunas: usa a primeira e avisa', () => {
    const r = parseNutritionLabel(['por 100 g por dose (30 g)', 'Lípidos 10 g 3 g', 'Proteínas 20 g 6 g', 'Energia 400 kcal 120 kcal']);
    expect(r.values).toMatchObject({ fat: 10, protein: 20, kcal: 400 });
    expect(r.servingSize).toBe(30); expect(r.warnings.join(' ')).toMatch(/colunas/);
  });
  it('base por dose → converte para 100 g', () => {
    const r = parseNutritionLabel(['Por dose (30 g)', 'Energia 120 kcal', 'Proteínas 6 g', 'Lípidos 3 g', 'Hidratos de carbono 15 g']);
    expect(r.basis).toBe('perServing');
    expect(labelToPer100(r.values, r.basis!, r.servingSize)).toMatchObject({ kcal: 400, protein: 20, fat: 10, carbs: 50 });
    expect(labelToPer100(r.values, 'perServing', null)).toBeNull();
  });
  it('texto sem rótulo → nada encontrado, com avisos (nunca inventa)', () => {
    const r = parseNutritionLabel(['Bolachas de aveia', 'Ingredientes: farinha, açúcar']);
    expect(r.values.kcal).toBeNull(); expect(r.basis).toBeNull(); expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('sal não confunde com palavras (salgado)', () => expect(parseNutritionLabel(['Snack salgado 5 g']).values.salt).toBeNull());
  it('agrupa linhas visuais por coordenadas', () => {
    const f = (text: string, top: number, left: number) => ({ text, frame: { top, left, height: 20 } });
    expect(groupRows([f('12 g', 102, 300), f('Lípidos', 100, 10), f('Proteínas', 140, 10), f('7 g', 141, 300)])).toEqual(['Lípidos 12 g', 'Proteínas 7 g']);
    expect(groupRows([{ text: 'a' }, { text: 'b' }])).toEqual(['a', 'b']);
  });
});

import { scalePer100Exact, roundMacros } from '../src';
describe('precisão intermédia', () => {
  it('por 1 ml não perde precisão (250 ml de leite = 115 kcal)', () => {
    const per1 = scalePer100Exact({ kcal: 46, protein: 3.3, carbs: 4.8, fat: 1.6 }, 1);
    expect(roundMacros({ kcal: per1.kcal * 250, protein: per1.protein * 250, carbs: per1.carbs * 250, fat: per1.fat * 250, fiber: 0 }).kcal).toBe(115);
  });
});
