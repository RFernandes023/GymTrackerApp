import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { deriveMetrics, isDateKey, toDateKey, type MeasurementInput } from '@gym/shared';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { getBodyInfo } from '../../features/profile/profileRepo';
import { deleteMeasurement, getMeasurement, saveMeasurement } from '../../features/progress/measurementsRepo';
import { colors, spacing } from '../../theme/tokens';

const num = (label: string) => z.string().trim().refine((v) => v === '' || /^\d+([.,]\d+)?$/.test(v), `${label}: número inválido`);
const schema = z.object({
  date: z.string().trim().refine(isDateKey, 'Data inválida (AAAA-MM-DD)'),
  weight: num('Peso'), bodyFat: num('Gordura'), muscleMass: num('Músculo'),
  neck: num('Pescoço'), waist: num('Cintura'), hip: num('Anca'), chest: num('Peito'), arms: num('Braços'), forearms: num('Antebraços'), thighs: num('Coxas'), calves: num('Gémeos'),
  c1n: z.string().trim(), c1v: num('Medida'), c2n: z.string().trim(), c2v: num('Medida'), c3n: z.string().trim(), c3v: num('Medida'),
  notes: z.string().max(300),
});
type Form = z.infer<typeof schema>;
const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const str = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));
const EMPTY: Form = { date: toDateKey(Date.now()), weight: '', bodyFat: '', muscleMass: '', neck: '', waist: '', hip: '', chest: '', arms: '', forearms: '', thighs: '', calves: '', c1n: '', c1v: '', c2n: '', c2v: '', c3n: '', c3v: '', notes: '' };

export default function NewMeasurement() {
  const user = useAuth((s) => s.user)!;
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [prof, setProf] = useState<{ sex: 'male' | 'female'; age: number; heightCm: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => { void (async () => {
    const b = await getBodyInfo(user.id); setProf(b ? { sex: b.sex, age: b.age, heightCm: b.heightCm } : null);
    if (id) {
      const m = await getMeasurement(user.id, String(id)); if (!m) return;
      const cs = Object.entries(m.custom);
      reset({ ...EMPTY, date: m.date, weight: str(m.weight), bodyFat: m.bodyFatSource === 'measured' ? str(m.bodyFat) : '', muscleMass: m.muscleSource === 'measured' ? str(m.muscleMass) : '',
        neck: str(m.neck), waist: str(m.waist), hip: str(m.hip), chest: str(m.chest), arms: str(m.arms), forearms: str(m.forearms), thighs: str(m.thighs), calves: str(m.calves),
        c1n: cs[0]?.[0] ?? '', c1v: str(cs[0]?.[1]), c2n: cs[1]?.[0] ?? '', c2v: str(cs[1]?.[1]), c3n: cs[2]?.[0] ?? '', c3v: str(cs[2]?.[1]), notes: m.notes ?? '' });
    }
  })(); }, [id, user.id, reset]);

  const w = watch();
  const live = useMemo(() => {
    const m: MeasurementInput = { weight: n(w.weight), bodyFat: n(w.bodyFat), muscleMass: n(w.muscleMass), neck: n(w.neck), waist: n(w.waist), hip: n(w.hip) };
    try { return deriveMetrics(m, prof); } catch { return null; }
  }, [w.weight, w.bodyFat, w.muscleMass, w.neck, w.waist, w.hip, prof]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      setError(null);
      const custom: Record<string, number> = {};
      for (const [nm, val] of [[v.c1n, v.c1v], [v.c2n, v.c2v], [v.c3n, v.c3v]] as const) if (nm && n(val) !== null) custom[nm] = n(val)!;
      await saveMeasurement(user.id, { date: v.date, weight: n(v.weight), bodyFat: n(v.bodyFat), muscleMass: n(v.muscleMass), neck: n(v.neck), waist: n(v.waist), hip: n(v.hip), chest: n(v.chest), arms: n(v.arms), forearms: n(v.forearms), thighs: n(v.thighs), calves: n(v.calves), custom, notes: v.notes }, id ? String(id) : undefined);
      router.back();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
  });

  const f = (name: keyof Form, label: string, kb: 'decimal-pad' | 'default' = 'decimal-pad') => (
    <Controller control={control} name={name} render={({ field }) => <Field label={label} value={field.value} onChangeText={field.onChange} keyboardType={kb} error={errors[name]?.message as string | undefined} />} />
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
        <AppText variant="title">{id ? 'Editar registo' : 'Novo registo'}</AppText>
        {f('date', 'Data (AAAA-MM-DD)', 'default')}
        {f('weight', 'Peso (kg)')}

        <Card style={{ gap: spacing.xs, borderColor: colors.accent }}>
          <AppText variant="small" style={{ color: colors.accent }}>CALCULADO AUTOMATICAMENTE</AppText>
          {!prof ? (
            <><AppText>Sem perfil não é possível calcular o IMC nem as estimativas.</AppText><Button label="Definir perfil" variant="secondary" onPress={() => router.push('/profile')} /></>
          ) : (
            <>
              <AppText>IMC: {live?.bmi ?? '—'}</AppText>
              <AppText>Gordura: {live?.bodyFat != null ? `${live.bodyFat} % (${live.bodyFatSource === 'measured' ? 'medido' : 'estimativa'})` : '—'}</AppText>
              <AppText>Massa muscular: {live?.muscleMass != null ? `${live.muscleMass} kg (${live.muscleSource === 'measured' ? 'medido' : 'estimativa'})` : '—'}</AppText>
              <AppText variant="small" muted>Com pescoço e cintura (e anca nas mulheres) a estimativa usa o método US Navy; sem eles, usa o IMC. São aproximações.</AppText>
            </>
          )}
        </Card>

        <AppText variant="h2">Medições de equipamento (opcional)</AppText>
        <AppText variant="small" muted>Só preenche se vieram de uma balança de bioimpedância, DEXA, etc. Substituem as estimativas.</AppText>
        {f('bodyFat', 'Gordura corporal medida (%)')}
        {f('muscleMass', 'Massa muscular medida (kg)')}

        <AppText variant="h2">Perímetros (cm)</AppText>
        {f('neck', 'Pescoço')}{f('waist', 'Cintura')}{f('hip', 'Anca')}{f('chest', 'Peito')}{f('arms', 'Braços')}{f('forearms', 'Antebraços')}{f('thighs', 'Coxas')}{f('calves', 'Gémeos')}

        <AppText variant="h2">Outras medidas</AppText>
        {([['c1n', 'c1v'], ['c2n', 'c2v'], ['c3n', 'c3v']] as const).map(([a, b], i) => (
          <View key={a} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 2 }}>{f(a, `Nome ${i + 1}`, 'default')}</View><View style={{ flex: 1 }}>{f(b, 'Valor')}</View>
          </View>
        ))}
        <Controller control={control} name="notes" render={({ field }) => <Field label="Notas (opcional)" multiline value={field.value} onChangeText={field.onChange} />} />
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
        <Button label="Guardar" loading={isSubmitting} onPress={() => void onSubmit()} />
        {id ? <Button label="Eliminar registo" variant="danger" onPress={() => Alert.alert('Eliminar registo', 'Apagar este registo?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteMeasurement(user.id, String(id)); router.back(); } }])} /> : null}
      </ScrollView>
    </Screen>
  );
}
