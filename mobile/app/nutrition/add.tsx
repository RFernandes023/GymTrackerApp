import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { FoodDraft } from '@gym/shared';
import { AppText, Button, Screen, ScreenHeader } from '../../components/ui';
import { Chip, ChipRow, Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { saveFood, searchFoods } from '../../features/nutrition/foodsRepo';
import type { FoodRecord } from '../../features/nutrition/types';
import { searchOnline } from '../../services/openFoodFacts';
import { colors, radius, spacing } from '../../theme/tokens';

export default function AddFood() {
  const user = useAuth((s) => s.user)!;
  const p = useLocalSearchParams<{ date: string; meal: string; recipeId?: string }>();
  const ingredientMode = !!p.recipeId;
  const [tab, setTab] = useState<'recent' | 'favorites' | 'all'>('recent');
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodRecord[]>([]);
  const [online, setOnline] = useState<{ drafts: FoodDraft[] } | { msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFoods(await searchFoods(user.id, query.trim() ? { query } : tab === 'recent' ? { recent: true } : tab === 'favorites' ? { favorites: true } : {}));
  }, [user.id, query, tab]);
  useEffect(() => { const t = setTimeout(() => void load(), 150); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setOnline(null); }, [query]);

  const base = { date: p.date, meal: p.meal, ...(p.recipeId ? { recipeTarget: p.recipeId } : {}) };
  const open = (id: string) => router.push({ pathname: '/nutrition/log', params: { foodId: id, ...base } });

  const searchWeb = async () => {
    setBusy(true);
    const r = await searchOnline(query);
    setBusy(false);
    setOnline(r.status === 'ok' ? { drafts: r.drafts } : { msg: r.status === 'offline' ? 'Sem ligação à internet. Podes usar os alimentos guardados ou criar um manualmente.' : 'O Open Food Facts não respondeu. Tenta mais tarde.' });
  };
  const pickOnline = async (d: FoodDraft) => { const f = await saveFood(user.id, { ...d, source: 'openfoodfacts' }); open(f.id); };

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.sm, flex: 1 }}>
        <ScreenHeader title={ingredientMode ? 'Ingrediente' : 'Adicionar alimento'} />
        <Field label="Pesquisar" value={query} onChangeText={setQuery} placeholder="Nome, marca ou código de barras" autoCorrect={false} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: spacing.sm }}>
          <Chip label="Ler código de barras" onPress={() => router.push({ pathname: '/nutrition/scan', params: base })} />
          <Chip label="Fotografar rótulo" onPress={() => router.push({ pathname: '/nutrition/label', params: base })} />
          <Chip label="Criar manualmente" onPress={() => router.push({ pathname: '/nutrition/food-form', params: base })} />
          {!ingredientMode && <Chip label="Receitas" onPress={() => router.push({ pathname: '/recipes', params: { pick: '1', date: p.date, meal: p.meal } })} />}
        </ScrollView>
        {!query.trim() && (
          <ChipRow>
            <Chip label="Recentes" selected={tab === 'recent'} onPress={() => setTab('recent')} />
            <Chip label="Favoritos" selected={tab === 'favorites'} onPress={() => setTab('favorites')} />
            <Chip label="Todos" selected={tab === 'all'} onPress={() => setTab('all')} />
          </ChipRow>
        )}
        <FlatList
          data={foods} keyExtractor={(f) => f.id} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<AppText muted>{query.trim() ? 'Nada nos teus alimentos.' : 'Ainda não tens alimentos nesta lista. Lê um código de barras, fotografa um rótulo ou cria um alimento.'}</AppText>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => open(item.id)} style={row}>
              <AppText style={{ fontWeight: '600' }} numberOfLines={1}>{item.isFavorite ? '★ ' : ''}{item.name}</AppText>
              <AppText variant="small" muted numberOfLines={1}>{item.brand ? `${item.brand} · ` : ''}{Math.round(item.per100.kcal)} kcal / 100 {item.baseUnit}</AppText>
            </Pressable>
          )}
          ListFooterComponent={query.trim().length >= 2 ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {!online && <Button label="Pesquisar no Open Food Facts" variant="secondary" loading={busy} onPress={() => void searchWeb()} />}
              {online && 'msg' in online && <AppText muted>{online.msg}</AppText>}
              {online && 'drafts' in online && (online.drafts.length === 0 ? <AppText muted>Sem resultados com dados nutricionais completos.</AppText> : online.drafts.map((d, i) => (
                <Pressable key={`${d.barcode}-${i}`} accessibilityRole="button" onPress={() => void pickOnline(d)} style={row}>
                  <AppText style={{ fontWeight: '600' }} numberOfLines={1}>{d.name}</AppText>
                  <AppText variant="small" muted numberOfLines={1}>{d.brand ? `${d.brand} · ` : ''}{Math.round(d.per100.kcal)} kcal / 100 {d.baseUnit} · Open Food Facts</AppText>
                </Pressable>
              )))}
              {online && <AppText variant="small" muted>Dados do Open Food Facts (comunitários, podem conter erros). Confirma antes de registar.</AppText>}
            </View>
          ) : undefined}
        />
      </View>
    </Screen>
  );
}
const row = { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, minHeight: 56, justifyContent: 'center' as const };
