import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DASHBOARD_CARD_DEFS, DASHBOARD_GROUP_LABELS, type DashboardCardDef } from '@gym/shared';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { useAuth } from '../../store/authStore';
import { useDashboard } from '../../store/dashboardStore';
import { useSync } from '../../store/syncStore';
import { dashboardStats, type DashboardStats } from '../../features/workouts/statsRepo';
import { localInsights } from '../../features/ai/insights';
import { cardValue, PHASE_DONE } from '../../features/dashboard/cardValues';
import { colors, MIN_TOUCH, radius, spacing } from '../../theme/tokens';

const SYNC_ICON = { idle: 'cloud-done-outline', syncing: 'sync-outline', offline: 'cloud-offline-outline', error: 'alert-circle-outline', conflict: 'warning-outline' } as const;
const SYNC_LABEL = { idle: 'Tudo sincronizado', syncing: 'A sincronizar', offline: 'Sem ligação, alterações guardadas', error: 'Erro de sincronização', conflict: 'Conflito por resolver' } as const;
const GROUP_COLOR = { nutrition: colors.primary, training: colors.accent, progress: colors.warning, other: '#C084FC' } as const;
const GROUP_ICON = { nutrition: 'nutrition-outline', training: 'barbell-outline', progress: 'trending-up-outline', other: 'sparkles-outline' } as const;
const defByType = new Map(DASHBOARD_CARD_DEFS.map((d) => [d.type, d]));

function IconBtn({ name, label, onPress }: { name: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ width: MIN_TOUCH - 8, height: MIN_TOUCH - 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={20} color={colors.text} />
    </Pressable>
  );
}

function StatCard({ def, value, editing, onMove, onRemove }: {
  def: DashboardCardDef; value: ReturnType<typeof cardValue>; editing: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const ready = def.availableInPhase <= PHASE_DONE;
  return (
    <Card style={{ gap: spacing.xs, borderLeftWidth: 4, borderLeftColor: GROUP_COLOR[def.group] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons name={GROUP_ICON[def.group]} size={16} color={GROUP_COLOR[def.group]} />
          <AppText variant="small" muted numberOfLines={1} style={{ flex: 1 }}>{def.title}</AppText>
        </View>
        {editing && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <IconBtn name="chevron-up" label={`Subir ${def.title}`} onPress={() => onMove(-1)} />
            <IconBtn name="chevron-down" label={`Descer ${def.title}`} onPress={() => onMove(1)} />
            <IconBtn name="close" label={`Remover ${def.title}`} onPress={onRemove} />
          </View>
        )}
      </View>
      {/* Estado vazio honesto: sem dados reais mostra "—" (nunca valores inventados). */}
      <AppText variant={value && value.value.length > 12 ? 'h2' : 'stat'} numberOfLines={2} style={value ? undefined : { color: colors.textMuted }}>{value?.value ?? '—'}</AppText>
      <AppText variant="small" muted>{value?.sub ?? (ready ? 'Sem dados ainda' : `Disponível na Fase ${def.availableInPhase}`)}</AppText>
    </Card>
  );
}

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const { layout, editing, load, toggle, moveCard, setEditing } = useDashboard();
  const sync = useSync();
  const [adding, setAdding] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => { if (user) void load(user.id); }, [user, load]);
  useFocusEffect(useCallback(() => { if (user) { void sync.refresh(); void (async () => { const st = await dashboardStats(user.id); setStats(st); setStats({ ...st, insights: (await localInsights(user.id)).slice(0, 3) }); })(); } }, [user, layout]));

  const active = layout.filter((c) => c.enabled);
  const available = layout.filter((c) => !c.enabled);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.md, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <AppText variant="small" muted>Olá,</AppText>
            <AppText variant="title">{user?.name.split(' ')[0] ?? ''}</AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={SYNC_LABEL[sync.status]} onPress={() => router.push('/sync')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH, justifyContent: 'center' }}>
              <Ionicons name={SYNC_ICON[sync.status]} size={22} color={sync.status === 'idle' ? colors.primary : sync.status === 'syncing' ? colors.accent : colors.warning} />
              {sync.pending + sync.conflicts > 0 && <AppText variant="small" muted>{sync.conflicts > 0 ? `${sync.conflicts}!` : sync.pending}</AppText>}
            </Pressable>
            <IconBtn name={editing ? 'checkmark' : 'create-outline'} label={editing ? 'Concluir edição' : 'Editar dashboard'} onPress={() => setEditing(!editing)} />
            <IconBtn name="person-circle-outline" label="Definições" onPress={() => router.push('/settings')} />
          </View>
        </View>

        <FlatList
          data={active}
          keyExtractor={(c) => c.type}
          contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<AppText muted>Sem cartões. Toca em editar para adicionar.</AppText>}
          renderItem={({ item }) => {
            const def = defByType.get(item.type);
            return def ? (
              <StatCard def={def} value={stats ? cardValue(item.type, stats) : null} editing={editing}
                onMove={(d) => void moveCard(item.type, d)} onRemove={() => void toggle(item.type, false)} />
            ) : null;
          }}
          ListFooterComponent={editing ? <Button label="Adicionar cartões" variant="secondary" onPress={() => setAdding(true)} /> : undefined}
        />
      </View>

      <Modal visible={adding} animationType="slide" transparent onRequestClose={() => setAdding(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#000A' }}>
          <View style={{ maxHeight: '75%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md }}>
            <AppText variant="h2">Adicionar cartões</AppText>
            <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
              {(['nutrition', 'training', 'progress', 'other'] as const).map((g) => {
                const items = available.map((c) => defByType.get(c.type)).filter((d): d is DashboardCardDef => !!d && d.group === g);
                if (!items.length) return null;
                return (
                  <View key={g} style={{ gap: spacing.sm }}>
                    <AppText variant="small" muted>{DASHBOARD_GROUP_LABELS[g]}</AppText>
                    {items.map((d) => (
                      <Pressable key={d.type} accessibilityRole="button" onPress={() => void toggle(d.type, true)}
                        style={{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.lg }}>
                        <AppText>{d.title}</AppText>
                        <Ionicons name="add" size={22} color={colors.primary} />
                      </Pressable>
                    ))}
                  </View>
                );
              })}
              {available.length === 0 && <AppText muted>Todos os cartões já estão no dashboard.</AppText>}
            </ScrollView>
            <Button label="Fechar" variant="secondary" onPress={() => setAdding(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
