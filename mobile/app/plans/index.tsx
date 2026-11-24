import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText, Button, Card, IconButton, Screen, ScreenHeader, Sheet, EmptyState } from '../../components/ui';
import { Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { createPlan, deletePlan, duplicatePlan, listPlans, setActivePlan } from '../../features/workouts/plansRepo';
import type { Plan } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

export default function Plans() {
  const user = useAuth((s) => s.user)!;
  const [plans, setPlans] = useState<(Plan & { exerciseCount: number })[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const reload = useCallback(async () => setPlans(await listPlans(user.id)), [user.id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const create = async () => {
    if (!name.trim()) return;
    const id = await createPlan(user.id, name);
    setName(''); setCreating(false); await reload();
    router.push({ pathname: '/plans/[id]', params: { id } });
  };
  const confirmDelete = (p: Plan) => Alert.alert('Eliminar plano', `Eliminar "${p.name}"? O histórico de treinos já realizados é mantido.`, [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await deletePlan(p.id); await reload(); } },
  ]);

  return (
    <Screen footer={<Button label="Novo plano" icon="add" onPress={() => setCreating(true)} />}>
      <View style={{ padding: spacing.lg, gap: spacing.md, flex: 1 }}>
        <ScreenHeader title="Planos" />
        <FlatList data={plans} keyExtractor={(p) => p.id} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<EmptyState icon="clipboard-outline" title="Ainda sem planos" text="Cria o primeiro ou importa um plano já feito." action={{ label: 'Importar plano (JSON)', onPress: () => router.push('/import-plan') }} />}
          renderItem={({ item: p }) => (
            <Card style={{ gap: spacing.md, borderColor: p.isActive ? colors.primary : colors.border }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${p.name}`} onPress={() => router.push({ pathname: '/plans/[id]', params: { id: p.id } })} style={{ gap: 2 }}>
                {p.isActive ? <AppText variant="small" style={{ color: colors.primary, fontWeight: '700' }}>Plano ativo</AppText> : null}
                <AppText variant="h2">{p.name}</AppText>
                <AppText muted>{p.days.length} dia(s) · {p.exerciseCount} exercício(s)</AppText>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><Button compact label="Editar" variant="secondary" onPress={() => router.push({ pathname: '/plans/[id]', params: { id: p.id } })} /></View>
                {!p.isActive && <View style={{ flex: 1 }}><Button compact label="Usar este" onPress={async () => { await setActivePlan(user.id, p.id); await reload(); }} /></View>}
                <IconButton name="copy-outline" label="Duplicar" onPress={async () => { await duplicatePlan(p.id); await reload(); }} />
                <IconButton name="trash-outline" label="Eliminar" color={colors.danger} onPress={() => confirmDelete(p)} />
              </View>
            </Card>
          )} />
      </View>
      <Sheet visible={creating} title="Novo plano" onClose={() => setCreating(false)} footer={<Button label="Criar plano" onPress={() => void create()} disabled={!name.trim()} />}>
        <Field label="Nome do plano" value={name} onChangeText={setName} placeholder="Ex.: Push / Pull / Legs" onSubmitEditing={() => void create()} />
      </Sheet>
    </Screen>
  );
}
