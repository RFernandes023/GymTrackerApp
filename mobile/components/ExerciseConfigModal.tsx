import React from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { GOAL_DEFAULTS, type TrainingGoal } from '@gym/shared';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ExerciseConfig } from '@gym/shared';
import { AppText, Button, Card } from './ui';
import { Chip, ChipRow, Field, Stepper, Toggle } from './form';
import { colors, radius, spacing } from '../theme/tokens';

const schema = z.object({
  warmups: z.number().int().min(0).max(5),
  sets: z.number().int().min(1, 'Mínimo 1 série').max(20),
  repMin: z.number().int().min(1),
  repMax: z.number().int().max(100),
  weight: z.number().min(0),
  increment: z.number().positive('O incremento deve ser maior que 0'),
  restSeconds: z.number().int().min(0).max(1800),
  rir: z.number().int().min(0).max(5).nullable(),
  dropSets: z.number().int().min(0).max(5),
  restPauseSets: z.number().int().min(0).max(5),
  lastSetToFailure: z.boolean(),
  notes: z.string().max(500),
  goal: z.string(),
}).refine((v) => v.repMax >= v.repMin, { message: 'O máximo de repetições deve ser ≥ ao mínimo', path: ['repMax'] });

const INCREMENTS = [1.25, 2.5, 5];
const GOALS: [string, string][] = [['hypertrophy', 'Hipertrofia'], ['strength', 'Força'], ['endurance', 'Resistência']];

export function ExerciseConfigModal({ visible, title, initial, onCancel, onSave, suggest }: {
  visible: boolean; title: string; initial: ExerciseConfig; onCancel: () => void; onSave: (c: ExerciseConfig) => Promise<void>;
  /** Carga inicial estimada para um objetivo (null se não houver perfil/exercício sem carga externa). */
  suggest?: (goal: TrainingGoal, increment: number) => Promise<number | null>;
}) {
  const lastSuggested = React.useRef<number | null>(null);
  const { control, handleSubmit, reset, setValue, getValues, formState: { errors, isSubmitting } } = useForm<ExerciseConfig>({ resolver: zodResolver(schema) as any, defaultValues: initial });
  React.useEffect(() => { if (visible) reset(initial); }, [visible, initial, reset]);
  const num = (name: keyof ExerciseConfig, label: string, step: number, extra: { min?: number; max?: number } = {}) => (
    <Controller control={control} name={name as any} render={({ field }) => <Stepper label={label} value={field.value as number} step={step} onChange={field.onChange} {...extra} />} />
  );
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#000A' }}>
        <View style={{ maxHeight: '92%', backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <AppText variant="h2">{title}</AppText>
            {num('sets', 'Séries efetivas', 1, { min: 1, max: 20 })}
            {num('warmups', 'Séries de aquecimento', 1, { min: 0, max: 5 })}
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>{num('repMin', 'Repetições mín.', 1, { min: 1 })}</View>
              <View style={{ flex: 1 }}>{num('repMax', 'Repetições máx.', 1, { min: 1, max: 100 })}</View>
            </View>
            {errors.repMax ? <AppText variant="small" style={{ color: colors.danger }}>{errors.repMax.message}</AppText> : null}
            {num('weight', 'Peso inicial (kg)', 2.5)}
            <Controller control={control} name="increment" render={({ field }) => (
              <View style={{ gap: spacing.sm }}>
                <ChipRow>{INCREMENTS.map((i) => <Chip key={i} label={`${String(i).replace('.', ',')} kg`} selected={field.value === i} onPress={() => field.onChange(i)} />)}</ChipRow>
                <Stepper label="Incremento de peso (kg)" value={field.value} step={0.25} min={0.25} onChange={field.onChange} />
                {errors.increment ? <AppText variant="small" style={{ color: colors.danger }}>{errors.increment.message}</AppText> : null}
              </View>)} />
            {num('restSeconds', 'Descanso (segundos)', 15)}
            <Controller control={control} name="rir" render={({ field }) => (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="small" muted>RIR alvo (opcional)</AppText>
                <ChipRow>
                  <Chip label="—" selected={field.value === null} onPress={() => field.onChange(null)} />
                  {[0, 1, 2, 3, 4].map((r) => <Chip key={r} label={String(r)} selected={field.value === r} onPress={() => field.onChange(r)} />)}
                </ChipRow>
              </View>)} />
            <Controller control={control} name="goal" render={({ field }) => (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="small" muted>Objetivo (ajusta repetições e descanso)</AppText>
                <ChipRow>{GOALS.map(([k, v]) => <Chip key={k} label={v} selected={field.value === k} onPress={async () => {
                  field.onChange(k);
                  const d = GOAL_DEFAULTS[k as TrainingGoal];
                  setValue('repMin', d.repMin); setValue('repMax', d.repMax); setValue('restSeconds', d.restSeconds);
                  const w = getValues('weight');
                  // só recalcula a carga se ainda não foi definida por ti (0) ou se era a estimativa anterior
                  if (suggest && (w === 0 || w === lastSuggested.current)) {
                    const s2 = await suggest(k as TrainingGoal, getValues('increment'));
                    if (s2 !== null) { setValue('weight', s2); lastSuggested.current = s2; }
                  }
                }} />)}</ChipRow>
              </View>)} />
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="small" muted>Técnicas avançadas</AppText>
              <Controller control={control} name="lastSetToFailure" render={({ field }) => <Toggle label="Última série até à falha" value={field.value} onChange={field.onChange} />} />
              {num('dropSets', 'Drop sets no final', 1, { min: 0, max: 5 })}
              {num('restPauseSets', 'Mini-séries rest-pause', 1, { min: 0, max: 5 })}
            </Card>
            <Controller control={control} name="notes" render={({ field }) => <Field label="Notas" multiline value={field.value} onChangeText={field.onChange} />} />
            <Button label="Guardar" loading={isSubmitting} onPress={() => void handleSubmit(async (v) => onSave(v))()} />
            <Button label="Cancelar" variant="secondary" onPress={onCancel} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
