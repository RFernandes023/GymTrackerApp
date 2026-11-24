import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme/tokens';

export function Screen({ children, style }: ViewProps) {
  return (
    <SafeAreaView style={[s.screen, style]} edges={['top', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function AppText({ variant = 'body', muted, style, ...rest }: TextProps & { variant?: keyof typeof type; muted?: boolean }) {
  return <Text {...rest} style={[type[variant], { color: muted ? colors.textMuted : colors.text }, style]} />;
}

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[s.card, style]} />;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}
export function Button({ label, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.surfaceAlt;
  const fg = variant === 'primary' ? colors.primaryText : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonLabel, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  button: { minHeight: MIN_TOUCH + 8, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
});

/** Cabeçalho de ecrã: seta de voltar (alvo grande) + título + ação opcional à direita. */
export function ScreenHeader({ title, right, onBack }: { title: string; right?: React.ReactNode; onBack?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={8} onPress={onBack ?? (() => router.back())}
        style={({ pressed }) => ({ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header" style={[type.title, { color: colors.text, flex: 1 }]}>{title}</Text>
      {right}
    </View>
  );
}

/** Voltar discreto para ecrãs que já têm o seu próprio título. */
export function BackLink() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={8} onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: MIN_TOUCH, alignSelf: 'flex-start' }}>
      <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 15 }}>Voltar</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing.sm }}>{children}</Text>;
}

/** Estado vazio com ícone, texto e (opcional) ação. */
export function EmptyState({ icon = 'sparkles-outline', title, text, action }: { icon?: React.ComponentProps<typeof Ionicons>['name']; title: string; text?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}>
      <Ionicons name={icon} size={36} color={colors.textMuted} />
      <Text style={[type.h2, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{text}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </View>
  );
}
