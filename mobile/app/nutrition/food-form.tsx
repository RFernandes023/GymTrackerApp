import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { validatePer100, type Per100 } from '@gym/shared';
import { AppText, Button, Screen } from '../../components/ui';
import { Chip, ChipRow, Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { getFood, saveFood } from '../../features/nutrition/foodsRepo';
import { colors, spacing } from '../../theme/tokens';

const numStr = (label: string, required: boolean) =>
  z.string().trim().refine((v) => (required ? v !== '' : true) && (v === '' || /^\d+([.,]\d+)?$/.test(v)), `${label}: indica um número válido (≥ 0)`);

const schema = z.object({
  name: z.string().trim().min(1, 'Indica o nome'),
  brand: z.string().trim(),
  barcode: z.string().trim().refine((v) => v === '' || /^\d{8,14}$/.test(v), 'O código de barras deve ter 8 a 14 dígitos'),
  baseUnit: z.enum(['g', 'ml']),
  kcal: numStr('Calorias', true), protein: numStr('Proteínas', true), carbs: numStr('Hidratos', true), fat: numStr('Gorduras', true),
  satFat: numStr('Saturados', false), sugars: numStr('Açúcares', false), fiber: numStr('Fibra', false), salt: numStr('Sal', false),
  servingSize: numStr('Dose', false), unitWeight: numStr('Peso da unidade', false),
});
type Form = z.infer<typeof schema>;
const n = (s: string) => (s === '' ? null : Number(s.replace(',', '.')));
const str = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

export default function FoodForm() {
  const user = useAuth((s) => s.user)!;
  const p = useLocalSearchParams<{ foodId?: string; barcode?: string; date?: string; meal?: string; recipeTarget?: string }>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'custom' | 'openfoodfacts' | 'label_ocr'>('custom');
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', brand: '', barcode: p.barcode ?? '', baseUnit: 'g', kcal: '', protein: '', carbs: '', fat: '', satFat: '', sugars: '', fiber: '', salt: '', servingSize: '', unitWeight: '' },
  });

  useEffect(() => {
    if (!p.foodId) return;
    void getFood(user.id, p.foodId).then((f) => {
      if (!f) return;
      setSource(f.source);
      reset({ name: f.name, brand: f.brand ?? '', barcode: f.barcode ?? '', baseUnit: f.baseUnit, kcal: str(f.per100.kcal), protein: str(f.per100.protein), carbs: str(f.per100.carbs), fat: str(f.per100.fat),
        satFat: str(f.per100.satFat), sugars: str(f.per100.sugars), fiber: str(f.per100.fiber), salt: str(f.per100.salt), servingSize: str(f.servingSize), unitWeight: str(f.unitWeight) });
    });
  }, [p.foodId, user.id, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const per100: Per100 = { kcal: n(v.kcal)!, protein: n(v.protein)!, carbs: n(v.carbs)!, fat: n(v.fat)!, satFat: n(v.satFat), sugars: n(v.sugars), fiber: n(v.fiber), salt: n(v.salt) };
    const check = validatePer100(per100);
    if (check.errors.length) { setError(check.errors[0]!); return; }
    if (check.warnings.length && !confirmed) { setWarnings(check.warnings); setConfirmed(true); return; }
    try {
      const serving = n(v.servingSize);
      const food = await saveFood(user.id, { id: p.foodId, name: v.name, brand: v.brand || null, barcode: v.barcode || null, baseUnit: v.baseUnit, per100, servingSize: serving, servingLabel: serving ? `${serving} ${v.baseUnit}` : null, unitWeight: n(v.unitWeight), source });
      router.replace({ pathname: '/nutrition/log', params: { foodId: food.id, date: p.date, meal: p.meal, ...(p.recipeTarget ? { recipeTarget: p.recipeTarget } : {}) } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
  });

  const field = (name: keyof Form, label: string, keyboard: 'default' | 'decimal-pad' | 'number-pad' = 'decimal-pad') => (
    <Controller control={control} name={name} render={({ field: f }) => <Field label={label} value={String(f.value)} onChangeText={(t) => { f.onChange(t); setConfirmed(false); setWarnings([]); }} keyboardType={keyboard} error={errors[name]?.message as string | undefined} />} />
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
        <AppText variant="title">{p.foodId ? 'Editar alimento' : 'Novo alimento'}</AppText>
        {field('name', 'Nome', 'default')}
        {field('brand', 'Marca (opcional)', 'default')}
        {field('barcode', 'Código de barras (opcional)', 'number-pad')}
        <Controller control={control} name="baseUnit" render={({ field: f }) => (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="small" muted>Os valores abaixo são por 100…</AppText>
            <ChipRow><Chip label="gramas (g)" selected={f.value === 'g'} onPress={() => f.onChange('g')} /><Chip label="mililitros (ml)" selected={f.value === 'ml'} onPress={() => f.onChange('ml')} /></ChipRow>
          </View>)} />
        {field('kcal', 'Calorias (kcal)')}
        {field('protein', 'Proteínas (g)')}
        {field('carbs', 'Hidratos de carbono (g)')}
        {field('fat', 'Gorduras (g)')}
        {field('satFat', 'Saturados (g, opcional)')}
        {field('sugars', 'Açúcares (g, opcional)')}
        {field('fiber', 'Fibra (g, opcional)')}
        {field('salt', 'Sal (g, opcional)')}
        {field('servingSize', 'Tamanho de uma dose (g/ml, opcional)')}
        {field('unitWeight', 'Peso de uma unidade (g/ml, opcional)')}
        {warnings.map((w, i) => <AppText key={i} style={{ color: colors.warning }}>⚠ {w}</AppText>)}
        {warnings.length > 0 && <AppText variant="small" muted>Toca em Guardar novamente para confirmar estes valores.</AppText>}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
        <Button label={warnings.length ? 'Guardar mesmo assim' : 'Guardar'} loading={isSubmitting} onPress={() => void onSubmit()} />
      </ScrollView>
    </Screen>
  );
}
