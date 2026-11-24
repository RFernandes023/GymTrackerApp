import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, MIN_TOUCH, radius, spacing } from '../theme/tokens';
import { AppText } from './ui';
import { tapHaptic } from '../utils/haptics';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[s.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <Text style={{ color: selected ? colors.primaryText : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  // flexGrow/flexShrink: 0 evita que o ScrollView horizontal seja comprimido e as linhas se sobreponham dentro de contentores flex
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' }}>{children}</ScrollView>;
}

export function Field({ label, error, ...rest }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="small" muted>{label}</AppText>
      <TextInput placeholderTextColor={colors.textMuted} accessibilityLabel={label} {...rest}
        style={[s.input, rest.multiline && { minHeight: 90, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null, rest.style]} />
      {error ? <AppText variant="small" style={{ color: colors.danger }}>{error}</AppText> : null}
    </View>
  );
}

const parse = (t: string) => { const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Controlo com botões − / + e edição manual (usado para peso, repetições e configuração). */
export function Stepper({ label, value, step, onChange, min = 0, max = 9999, format, big }: {
  label?: string; value: number; step: number; onChange: (n: number) => void; min?: number; max?: number; format?: (n: number) => string; big?: boolean;
}) {
  const fmt = format ?? ((n: number) => String(Math.round(n * 100) / 100).replace('.', ','));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(fmt(value)); }, [value, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  const bump = (d: -1 | 1) => { tapHaptic(); onChange(Math.min(max, Math.max(min, Math.round((value + d * step) * 100) / 100))); };
  const size = big ? 64 : MIN_TOUCH;
  const btn = { width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <AppText variant="small" muted>{label}</AppText> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${label ?? ''}`} style={btn} onPress={() => bump(-1)}><Ionicons name="remove" size={28} color={colors.text} /></Pressable>
        <TextInput
          value={text} keyboardType="decimal-pad" selectTextOnFocus
          onFocus={() => setFocused(true)}
          onChangeText={setText}
          onBlur={() => { setFocused(false); const n = parse(text); if (n !== null) onChange(Math.min(max, Math.max(min, n))); else setText(fmt(value)); }}
          style={[s.input, { flex: 1, textAlign: 'center', fontSize: big ? 28 : 18, fontWeight: '700', minHeight: size, paddingVertical: 0 }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${label ?? ''}`} style={btn} onPress={() => bump(1)}><Ionicons name="add" size={28} color={colors.text} /></Pressable>
      </View>
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)}
      style={{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText>{label}</AppText>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={26} color={value ? colors.primary : colors.textMuted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: MIN_TOUCH, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
});
