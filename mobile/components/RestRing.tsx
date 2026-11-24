import React from 'react';
import { View } from 'react-native';
import { formatDuration } from '@gym/shared';
import { AppText } from './ui';
import { Ring } from './Ring';
import { colors } from '../theme/tokens';

/** Contagem decrescente do descanso (o tempo vem sempre de timestamps; isto é só apresentação). */
export function RestRing({ remainingMs, totalMs, size = 84 }: { remainingMs: number; totalMs: number; size?: number }) {
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`Descanso: ${Math.ceil(remainingMs / 1000)} segundos`}>
      <Ring value={totalMs > 0 ? remainingMs / Math.max(totalMs, remainingMs) : 0} size={size} stroke={7} color={colors.accent}>
        <AppText variant="h2" style={{ fontVariant: ['tabular-nums'] }}>{formatDuration(Math.ceil(remainingMs / 1000) * 1000)}</AppText>
      </Ring>
    </View>
  );
}
