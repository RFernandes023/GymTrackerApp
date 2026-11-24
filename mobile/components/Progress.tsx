import React from 'react';
import { View } from 'react-native';
import { AppText } from './ui';
import { colors, radius, spacing } from '../theme/tokens';

export function ProgressBar({ value, max, color = colors.primary, label }: { value: number; max: number | null; color?: string; label: string }) {
  const pct = max && max > 0 ? Math.min(1, value / max) : 0;
  const over = !!max && value > max;
  return (
    <View accessible accessibilityLabel={label} style={{ gap: 4 }}>
      <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: over ? colors.warning : color }} />
      </View>
    </View>
  );
}

export function MacroRow({ name, value, goal, color }: { name: string; value: number; goal: number | null; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="small" muted>{name}</AppText>
        <AppText variant="small">{Math.round(value)} g{goal ? ` / ${Math.round(goal)} g` : ''}</AppText>
      </View>
      <ProgressBar value={value} max={goal} color={color} label={`${name} ${Math.round(value)} gramas`} />
    </View>
  );
}
export const gap = spacing.sm;
