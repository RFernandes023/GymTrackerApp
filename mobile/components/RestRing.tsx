import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { formatDuration } from '@gym/shared';
import { AppText } from './ui';
import { colors } from '../theme/tokens';

/** Anel de contagem decrescente do descanso (o tempo vem sempre de timestamps; isto é só apresentação). */
export function RestRing({ remainingMs, totalMs, size = 168 }: { remainingMs: number; totalMs: number; size?: number }) {
  const stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / Math.max(totalMs, remainingMs))) : 0;
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`Descanso: ${Math.ceil(remainingMs / 1000)} segundos`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - frac)} />
      </Svg>
      <AppText variant="small" muted>Descanso</AppText>
      <AppText variant="stat" accessibilityLiveRegion="polite">{formatDuration(Math.ceil(remainingMs / 1000) * 1000)}</AppText>
    </View>
  );
}
