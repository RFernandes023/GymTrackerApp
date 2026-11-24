import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, Screen, BackLink } from '../../components/ui';
import { ExerciseImage } from '../../components/ExerciseImage';
import { getExercise } from '../../features/workouts/exercisesRepo';
import { EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS, MUSCLE_LABELS, exerciseName, type Exercise } from '../../features/workouts/types';
import { spacing } from '../../theme/tokens';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ex, setEx] = useState<Exercise | null>(null);
  useEffect(() => { void getExercise(String(id)).then(setEx); }, [id]);
  if (!ex) return <Screen><View style={{ padding: spacing.lg }}><AppText muted>A carregar…</AppText></View></Screen>;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <BackLink />
        <View style={{ alignItems: 'center' }}><ExerciseImage exercise={ex} size={260} animated showCredit /></View>
        <View>
          <AppText variant="title">{exerciseName(ex)}</AppText>
          {ex.namePt ? <AppText muted>{ex.nameEn}</AppText> : null}
          {ex.altName ? <AppText muted>Também: {ex.altName}</AppText> : null}
        </View>
        <Card style={{ gap: spacing.xs }}>
          <AppText>Principal: {ex.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}</AppText>
          {ex.secondary.length ? <AppText muted>Secundários: {ex.secondary.map((m) => MUSCLE_LABELS[m]).join(', ')}</AppText> : null}
          <AppText muted>Equipamento: {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}{ex.type ? ` · ${EXERCISE_TYPE_LABELS[ex.type] ?? ex.type}` : ''}</AppText>
        </Card>
        {ex.description ? <AppText>{ex.description}</AppText> : null}
        {ex.instructions.length > 0 && (
          <Card style={{ gap: spacing.sm }}>
            <AppText variant="h2">Instruções{ex.isCustom ? '' : ' (em inglês)'}</AppText>
            {ex.instructions.map((t, i) => <AppText key={i} muted>{i + 1}. {t}</AppText>)}
          </Card>
        )}
        {!ex.isCustom && <AppText variant="small" muted>Fonte: Free Exercise DB (domínio público, Unlicense). Imagens obtidas online; sem ligação é mostrado um ícone.</AppText>}
      </ScrollView>
    </Screen>
  );
}
