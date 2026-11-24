import React from 'react';
import { View } from 'react-native';
import { AppText, Card, Screen } from './ui';
import { spacing } from '../theme/tokens';

/** Área ainda não implementada. Identificada como tal — não simula funcionalidade. */
export function PhasePlaceholder({ title, phase, items }: { title: string; phase: number; items: string[] }) {
  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <AppText variant="title">{title}</AppText>
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="h2">Em desenvolvimento — Fase {phase}</AppText>
          {items.map((i) => <AppText key={i} muted>• {i}</AppText>)}
        </Card>
      </View>
    </Screen>
  );
}
