import React from 'react';
import { View } from 'react-native';
import type { Macros } from '@gym/shared';
import { AppText } from './ui';
import { Ring } from './Ring';
import { MacroRow } from './Progress';
import { colors, spacing } from '../theme/tokens';
import { fmtNumber } from '../utils/format';
import type { Goal } from '../features/nutrition/types';

/** Calorias do dia num anel + os três macros. Igual no Início e na Nutrição. */
export function NutritionSummary({ totals: t, goal: g }: { totals: Macros; goal: Goal | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
      <View accessible accessibilityLabel={`${Math.round(t.kcal)} calorias consumidas${g ? ` de ${Math.round(g.calories)}` : ''}`}>
        <Ring value={g ? t.kcal / g.calories : 0} color={g && t.kcal > g.calories ? colors.warning : colors.primary}>
          <AppText variant="stat" style={{ fontSize: 27 }}>{fmtNumber(Math.round(t.kcal))}</AppText>
          <AppText variant="small" muted>{g ? `de ${fmtNumber(Math.round(g.calories))} kcal` : 'kcal'}</AppText>
        </Ring>
      </View>
      <View style={{ flex: 1, gap: spacing.md }}>
        <MacroRow name="Proteínas" value={t.protein} goal={g?.protein ?? null} color={colors.accent} />
        <MacroRow name="Hidratos" value={t.carbs} goal={g?.carbs ?? null} color={colors.primary} />
        <MacroRow name="Gorduras" value={t.fat} goal={g?.fat ?? null} color={colors.warning} />
      </View>
    </View>
  );
}
