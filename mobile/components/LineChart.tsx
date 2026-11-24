import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { chartLayout, type Point } from '@gym/shared';
import { AppText } from './ui';
import { colors } from '../theme/tokens';

const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' });
const label = (d: string) => dateFmt.format(new Date(`${d}T12:00:00`));

export function LineChart({ points, height = 190, format = (n: number) => String(Math.round(n * 10) / 10).replace('.', ','), title }: {
  points: Point[]; height?: number; format?: (n: number) => string; title: string;
}) {
  const [w, setW] = useState(0);
  const pad = 14, left = 40;
  const { coords, min, max } = chartLayout(points, Math.max(w - left, 120), height - 22, pad);
  const line = coords.map((c) => `${c.x + left},${c.y}`).join(' ');
  const first = points[0], last = points.at(-1);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={points.length ? `${title}: de ${format(first!.value)} a ${format(last!.value)}, ${points.length} registos` : `${title}: sem dados`}>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Line x1={left} y1={pad} x2={left} y2={height - 22 - pad} stroke={colors.border} strokeWidth={1} />
          <Line x1={left} y1={height - 22 - pad} x2={w} y2={height - 22 - pad} stroke={colors.border} strokeWidth={1} />
          <SvgText x={0} y={pad + 4} fill={colors.textMuted} fontSize={11}>{format(max)}</SvgText>
          <SvgText x={0} y={height - 22 - pad + 4} fill={colors.textMuted} fontSize={11}>{format(min)}</SvgText>
          {coords.length > 1 && <Polyline points={line} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinejoin="round" />}
          {coords.map((c, i) => <Circle key={i} cx={c.x + left} cy={c.y} r={i === coords.length - 1 ? 5 : 3} fill={colors.primary} />)}
          {first && <SvgText x={left} y={height - 4} fill={colors.textMuted} fontSize={11}>{label(first.date)}</SvgText>}
          {last && points.length > 1 && <SvgText x={w} y={height - 4} fill={colors.textMuted} fontSize={11} textAnchor="end">{label(last.date)}</SvgText>}
        </Svg>
      )}
      {points.length < 2 && <AppText variant="small" muted>{points.length === 0 ? 'Sem registos para este indicador.' : 'Regista pelo menos mais um valor para ver a evolução.'}</AppText>}
    </View>
  );
}
