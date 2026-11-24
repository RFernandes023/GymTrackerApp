import React, { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppText, Button, Card, Screen, ScreenHeader, EmptyState } from '../../components/ui';
import { Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { createPlan, deletePlan, duplicatePlan, listPlans, setActivePlan } from '../../features/workouts/plansRepo';
import type { Plan } from '../../features/workouts/types';
import { colors, spacing } from '../../theme/tokens';

export default function Plans() {
  const user = useAuth((s) => s.user)!;
  const [plans, setPlans] = useState<(Plan & { exerciseCount: number })[]>([]);
  const [name, setName] = useState('');
  const reload = useCallback(async () => setPlans(await listPlans(user.id)), [user.id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const create = async () => {
    if (!name.trim()) return;
    const id = await createPlan(user.id, name);
    setName(''); await reload();
    router.push({ pathname: '/plans/[id]', params: { id } });
  };
  const confirmDelete = (p: Plan) => Alert.alert('Eliminar plano', `Eliminar "${p.name}"? O histórico de treinos já realizados é mantido.`, [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await deletePlan(p.id); await reload(); } },
  ]);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.md, flex: 1 }}>
        <ScreenHeader title="Planos" />
        <Field label="Novo plano" value={name} onChangeText={setName} placeholder="Ex.: Push / Pull / Legs" onSubmitEditing={() => void create()} />
        <Button label="Criar plano" onPress={() => void create()} disabled={!name.trim()} />
        <FlatList data={plans} keyExtractor={(p) => p.id} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<EmptyState icon="clipboard-outline" title="Ainda sem planos" text="Cria o primeiro acima ou importa um plano em JSON nas Definições." />}
          renderItem={({ item: p }) => (
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="h2">{p.name}</AppText>
                {p.isActive ? <AppText variant="small" style={{ color: colors.primary }}>Ativo</AppText> : null}
              </View>
              <AppText muted>{p.days.length} dia(s) · {p.exerciseCount} exercício(s)</AppText>
              <Button label="Editar" onPress={() => router.push({ pathname: '/plans/[id]', params: { id: p.id } })} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {!p.isActive && <View style={{ flex: 1 }}><Button label="Ativar" variant="secondary" onPress={async () => { await setActivePlan(user.id, p.id); await reload(); }} /></View>}
                <View style={{ flex: 1 }}><Button label="Duplicar" variant="secondary" onPress={async () => { await duplicatePlan(p.id); await reload(); }} /></View>
                <View style={{ flex: 1 }}><Button label="Eliminar" variant="danger" onPress={() => confirmDelete(p)} /></View>
              </View>
            </Card>
          )} />
      </View>
    </Screen>
  );
}
