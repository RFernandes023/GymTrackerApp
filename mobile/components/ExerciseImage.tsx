import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { frameIndex } from '@gym/shared';
import { colors, radius } from '../theme/tokens';
import type { Exercise } from '../features/workouts/types';
import { resolveMedia } from '../features/workouts/media';
import { MEDIA_MANIFEST } from '../constants/media';
import { AppText } from './ui';

/**
 * Demonstração do exercício. Com animação licenciada no manifesto → GIF animado; caso contrário alterna a posição inicial/final
 * (efeito de "GIF") com as imagens do Free Exercise DB. Sem média (ex.: exercício personalizado/sem ligação) mostra um ícone:
 * nunca uma imagem de outro exercício. Em listas usa `animated={false}` (poupa bateria e dados).
 */
export function ExerciseImage({ exercise, size = 64, animated = false, showCredit = false }: { exercise: Exercise | null; size?: number; animated?: boolean; showCredit?: boolean }) {
  const media = useMemo(() => (exercise ? resolveMedia(exercise, MEDIA_MANIFEST) : null), [exercise]);
  const [tick, setTick] = useState(0);
  const frames = media?.kind === 'frames' ? media.uris : [];

  useEffect(() => {
    if (!animated || frames.length < 2) return;
    void Image.prefetch(frames);
    const t = setInterval(() => setTick((n) => n + 1), 900);
    return () => clearInterval(t);
  }, [animated, frames.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const box = { width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const };
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={box}>
        {media?.kind === 'gif' ? (
          <Image source={{ uri: media.uri }} style={{ width: size, height: size }} contentFit="cover" autoplay={animated} cachePolicy="disk" accessibilityLabel={exercise?.nameEn} />
        ) : media?.kind === 'frames' ? (
          <Image source={{ uri: frames[animated ? frameIndex(tick * 900, frames.length) : 0] }} style={{ width: size, height: size }} contentFit="cover" transition={animated ? 350 : 0} cachePolicy="disk" accessibilityLabel={exercise?.nameEn} />
        ) : <Ionicons name="barbell-outline" size={size * 0.45} color={colors.textMuted} />}
      </View>
      {showCredit && media?.kind === 'gif' && media.credit ? <AppText variant="small" muted>{media.credit}</AppText> : null}
    </View>
  );
}
