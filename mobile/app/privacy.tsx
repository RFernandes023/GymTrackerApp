import React from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Card, Screen, ScreenHeader } from '../components/ui';
import { PRIVACY_DRAFT_NOTE, PRIVACY_SECTIONS } from '../constants/privacy';
import { colors, spacing } from '../theme/tokens';

export default function Privacy() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <ScreenHeader title="Política de privacidade" />
        <Card style={{ borderColor: colors.warning }}><AppText variant="small">{PRIVACY_DRAFT_NOTE}</AppText></Card>
        {PRIVACY_SECTIONS.map((s) => (
          <Card key={s.title} style={{ gap: spacing.xs }}>
            <AppText variant="h2">{s.title}</AppText>
            {s.items.map((t, i) => <AppText key={i} variant="small">• {t}</AppText>)}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
