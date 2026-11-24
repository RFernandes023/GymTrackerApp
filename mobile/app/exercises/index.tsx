import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Screen, ScreenHeader } from '../../components/ui';
import { Chip, ChipRow, Field } from '../../components/form';
import { ExerciseImage } from '../../components/ExerciseImage';
import { useAuth } from '../../store/authStore';
import { searchExercises } from '../../features/workouts/exercisesRepo';
import { addExerciseToDay } from '../../features/workouts/plansRepo';
import { addExerciseToSession } from '../../features/workouts/sessionsRepo';
import { EQUIPMENT, EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS, MUSCLES, MUSCLE_LABELS, exerciseName, type Exercise } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

const PAGE = 40;

export default function ExerciseLibrary() {
  const user = useAuth((s) => s.user)!;
  const { planId, dayId, sessionId } = useLocalSearchParams<{ planId?: string; dayId?: string; sessionId?: string }>();
  const picking = !!(dayId || sessionId);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [items, setItems] = useState<Exercise[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    const rows = await searchExercises(user.id, { query, muscle, equipment, type, limit: PAGE, offset });
    setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
    setDone(rows.length < PAGE);
  }, [user.id, query, muscle, equipment, type]);

  useEffect(() => { const t = setTimeout(() => void load(0), 200); return () => clearTimeout(t); }, [load]);

  const choose = async (e: Exercise) => {
    try {
      if (dayId && planId) await addExerciseToDay(planId, dayId, e.id);
      else if (sessionId) await addExerciseToSession(user.id, sessionId, e.id);
      else { router.push({ pathname: '/exercises/[id]', params: { id: e.id } }); return; }
      router.back();
    } catch { setError('Não foi possível adicionar o exercício.'); }
  };

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.sm, flex: 1 }}>
        <ScreenHeader title={picking ? 'Escolher exercício' : 'Exercícios'} />
        <Field label="Pesquisar" value={query} onChangeText={setQuery} placeholder="Nome em português ou inglês" autoCorrect={false} />
        <ChipRow>
          <Chip label="Todos os músculos" selected={!muscle} onPress={() => setMuscle(null)} />
          {MUSCLES.map((m) => <Chip key={m} label={MUSCLE_LABELS[m]!} selected={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />)}
        </ChipRow>
        <ChipRow>
          <Chip label="Todo o equipamento" selected={!equipment} onPress={() => setEquipment(null)} />
          {EQUIPMENT.map((m) => <Chip key={m} label={EQUIPMENT_LABELS[m]!} selected={equipment === m} onPress={() => setEquipment(equipment === m ? null : m)} />)}
        </ChipRow>
        <ChipRow>
          {Object.entries(EXERCISE_TYPE_LABELS).map(([k, v]) => <Chip key={k} label={v} selected={type === k} onPress={() => setType(type === k ? null : k)} />)}
        </ChipRow>
        {error ? <AppText variant="small" style={{ color: colors.danger }}>{error}</AppText> : null}
        <FlatList
          data={items} keyExtractor={(e) => e.id} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xxl }}
          onEndReachedThreshold={0.5} onEndReached={() => { if (!done) void load(items.length); }}
          ListEmptyComponent={<AppText muted>Nenhum exercício encontrado.</AppText>}
          ListHeaderComponent={!picking ? <Button label="Criar exercício personalizado" variant="secondary" onPress={() => router.push('/exercises/new')} /> : undefined}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => void choose(item)}
              style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <ExerciseImage exercise={item} />
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '600' }}>{exerciseName(item)}</AppText>
                {item.namePt ? <AppText variant="small" muted>{item.nameEn}</AppText> : null}
                <AppText variant="small" muted>{item.primary.map((m) => MUSCLE_LABELS[m]).join(', ')} · {EQUIPMENT_LABELS[item.equipment] ?? item.equipment}{item.isCustom ? ' · personalizado' : ''}</AppText>
              </View>
            </Pressable>
          )}
        />
      </View>
    </Screen>
  );
}
