import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Screen, ScreenHeader, EmptyState } from '../../components/ui';
import { Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { createRecipe, listRecipes, type Recipe } from '../../features/nutrition/recipesRepo';
import { colors, radius, spacing } from '../../theme/tokens';

export default function Recipes() {
  const user = useAuth((s) => s.user)!;
  const p = useLocalSearchParams<{ pick?: string; date?: string; meal?: string }>();
  const picking = p.pick === '1';
  const [items, setItems] = useState<Recipe[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { void listRecipes(user.id).then(setItems); }, [user.id]));

  const create = async () => {
    try { const id = await createRecipe(user.id, name, 1); setName(''); router.push({ pathname: '/recipes/[id]', params: { id } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro'); }
  };
  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.md, flex: 1 }}>
        <ScreenHeader title={picking ? 'Escolher receita' : 'Receitas'} />
        {!picking && (<>
          <Field label="Nova receita" value={name} onChangeText={setName} placeholder="Ex.: Frango com arroz" />
          {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
          <Button label="Criar receita" disabled={!name.trim()} onPress={() => void create()} />
        </>)}
        <FlatList data={items} keyExtractor={(r) => r.id} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<EmptyState icon="restaurant-outline" title="Ainda sem receitas" text="Cria uma receita para calcular macros por dose e planear refeições." />}
          renderItem={({ item: r }) => (
            <Pressable accessibilityRole="button"
              onPress={() => picking ? router.push({ pathname: '/nutrition/log', params: { recipeId: r.id, date: p.date, meal: p.meal } }) : router.push({ pathname: '/recipes/[id]', params: { id: r.id } })}
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
              <AppText style={{ fontWeight: '600' }}>{r.isFavorite ? '★ ' : ''}{r.name}</AppText>
              <AppText variant="small" muted>{r.servings} dose(s) · {Math.round(r.perServing.kcal)} kcal/dose · P {Math.round(r.perServing.protein)} · H {Math.round(r.perServing.carbs)} · G {Math.round(r.perServing.fat)}</AppText>
              {r.isMealPrep && r.remainingPortions != null ? <AppText variant="small" style={{ color: colors.primary }}>Meal prep: {r.remainingPortions} dose(s) disponíveis</AppText> : null}
            </Pressable>
          )} />
      </View>
    </Screen>
  );
}
