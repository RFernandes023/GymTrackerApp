import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, Screen } from '../../components/ui';
import { Chip, ChipRow, Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { createCustomExercise } from '../../features/workouts/exercisesRepo';
import { EQUIPMENT, EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS, MUSCLES, MUSCLE_LABELS } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

const schema = z.object({
  namePt: z.string().trim().min(2, 'Indica o nome em português'),
  nameEn: z.string().trim().optional(),
  altName: z.string().trim().optional(),
  primary: z.string().min(1, 'Escolhe o músculo principal'),
  secondary: z.array(z.string()),
  equipment: z.string().min(1),
  type: z.string().nullable(),
  description: z.string().optional(),
  instructions: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function NewExercise() {
  const user = useAuth((s) => s.user)!;
  const [saveError, setSaveError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { namePt: '', nameEn: '', altName: '', primary: '', secondary: [], equipment: 'other', type: null, description: '', instructions: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    try {
      await createCustomExercise(user.id, {
        namePt: v.namePt, nameEn: v.nameEn, altName: v.altName, primary: [v.primary], secondary: v.secondary.filter((m) => m !== v.primary),
        equipment: v.equipment, type: v.type, description: v.description,
        instructions: (v.instructions ?? '').split('\n').map((l) => l.trim()).filter(Boolean),
      });
      router.back();
    } catch { setSaveError('Não foi possível guardar o exercício.'); }
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
        <AppText variant="title">Novo exercício</AppText>
        <Controller control={control} name="namePt" render={({ field }) => <Field label="Nome (português)" value={field.value} onChangeText={field.onChange} error={errors.namePt?.message} />} />
        <Controller control={control} name="nameEn" render={({ field }) => <Field label="Nome (inglês, opcional)" value={field.value} onChangeText={field.onChange} />} />
        <Controller control={control} name="altName" render={({ field }) => <Field label="Nome alternativo (opcional)" value={field.value} onChangeText={field.onChange} />} />
        <AppText variant="small" muted>Músculo principal</AppText>
        <Controller control={control} name="primary" render={({ field }) => (
          <ChipRow>{MUSCLES.map((m) => <Chip key={m} label={MUSCLE_LABELS[m]!} selected={field.value === m} onPress={() => field.onChange(m)} />)}</ChipRow>)} />
        {errors.primary ? <AppText variant="small" style={{ color: colors.danger }}>{errors.primary.message}</AppText> : null}
        <AppText variant="small" muted>Músculos secundários</AppText>
        <Controller control={control} name="secondary" render={({ field }) => (
          <ChipRow>{MUSCLES.map((m) => <Chip key={m} label={MUSCLE_LABELS[m]!} selected={field.value.includes(m)}
            onPress={() => field.onChange(field.value.includes(m) ? field.value.filter((x) => x !== m) : [...field.value, m])} />)}</ChipRow>)} />
        <AppText variant="small" muted>Equipamento</AppText>
        <Controller control={control} name="equipment" render={({ field }) => (
          <ChipRow>{EQUIPMENT.map((m) => <Chip key={m} label={EQUIPMENT_LABELS[m]!} selected={field.value === m} onPress={() => field.onChange(m)} />)}</ChipRow>)} />
        <AppText variant="small" muted>Tipo</AppText>
        <Controller control={control} name="type" render={({ field }) => (
          <ChipRow>{Object.entries(EXERCISE_TYPE_LABELS).map(([k, v]) => <Chip key={k} label={v} selected={field.value === k} onPress={() => field.onChange(field.value === k ? null : k)} />)}</ChipRow>)} />
        <Controller control={control} name="description" render={({ field }) => <Field label="Descrição (opcional)" multiline value={field.value} onChangeText={field.onChange} />} />
        <Controller control={control} name="instructions" render={({ field }) => <Field label="Instruções (um passo por linha)" multiline value={field.value} onChangeText={field.onChange} />} />
        {saveError ? <AppText style={{ color: colors.danger }}>{saveError}</AppText> : null}
        <View><Button label="Guardar exercício" loading={isSubmitting} onPress={() => void onSubmit()} /></View>
      </ScrollView>
    </Screen>
  );
}
