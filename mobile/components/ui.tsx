import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, MIN_TOUCH, radius, spacing, type } from '../theme/tokens';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Base de todos os ecrãs. Respeita sempre as barras do sistema: nos ecrãs normais também em baixo
 * (botões do Android); nos separadores (`tab`) quem reserva esse espaço é a barra de separadores.
 * `footer` fica fixo por baixo do conteúdo (ação principal sempre visível, acima do teclado).
 */
export function Screen({ children, style, tab, footer }: ViewProps & { tab?: boolean; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={[s.screen, style]} edges={tab ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" enabled={!tab}>
        <View style={{ flex: 1 }}>{children}</View>
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
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
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  /** Botão mais baixo, para ações secundárias dentro de cartões. */
  compact?: boolean;
  loading?: boolean;
  disabled?: boolean;
}
export function Button({ label, onPress, variant = 'primary', icon, compact, loading, disabled }: ButtonProps) {
  const bg = { primary: colors.primary, secondary: colors.surfaceAlt, danger: colors.dangerSoft, ghost: 'transparent' }[variant];
  const fg = { primary: colors.primaryText, secondary: colors.text, danger: colors.danger, ghost: colors.primary }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.button, compact && s.buttonCompact, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 18 : 20} color={fg} /> : null}
          <Text style={[s.buttonLabel, compact && { fontSize: 15 }, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ name, label, onPress, color = colors.text, filled = true }: { name: IconName; label: string; onPress: () => void; color?: string; filled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [s.iconButton, { backgroundColor: filled ? colors.surfaceAlt : 'transparent', opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={name} size={22} color={color} />
    </Pressable>
  );
}

/** Linha tocável: ícone, título, subtítulo e seta. Agrupar dentro de `ListGroup`. */
export function ListRow({ icon, color = colors.primary, title, sub, onPress, danger, label }: {
  icon?: IconName; color?: string; title: string; sub?: string; onPress: () => void; danger?: boolean; label?: string;
}) {
  const tint = danger ? colors.danger : color;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {icon ? <View style={[s.rowIcon, { backgroundColor: `${tint}22` }]}><Ionicons name={icon} size={20} color={tint} /></View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {sub ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function ListGroup({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.group}>
      {React.Children.toArray(children).map((c, i) => <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null}>{c}</View>)}
    </View>
  );
}

/** Painel inferior (modal) que nunca fica por baixo dos botões do Android nem do teclado. */
export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessible={false} style={[StyleSheet.absoluteFill, { backgroundColor: '#000B' }]} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.sheetHead}>
            <AppText variant="h2" style={{ flex: 1 }}>{title}</AppText>
            <IconButton name="close" label="Fechar" onPress={onClose} />
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Título dos separadores principais, com ações à direita. */
export function TabHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH }}>
      <View style={{ flex: 1 }}>
        {sub ? <AppText variant="small" muted>{sub}</AppText> : null}
        <AppText variant="title" accessibilityRole="header" numberOfLines={1}>{title}</AppText>
      </View>
      {children}
    </View>
  );
}

/** Cabeçalho de ecrã: seta de voltar (alvo grande) + título + ação opcional à direita. */
export function ScreenHeader({ title, sub, right, onBack }: { title: string; sub?: string; right?: React.ReactNode; onBack?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconButton name="chevron-back" label="Voltar" onPress={onBack ?? (() => router.back())} />
      <View style={{ flex: 1 }}>
        {sub ? <AppText variant="small" muted numberOfLines={1}>{sub}</AppText> : null}
        <Text numberOfLines={2} accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{title}</Text>
      </View>
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

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: action ? MIN_TOUCH : 28, marginTop: spacing.sm }}>
      <AppText accessibilityRole="header" variant="h2" style={{ flexShrink: 1 }}>{children}</AppText>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingLeft: spacing.lg }}>
          <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Estado vazio com ícone, texto e (opcional) ação. */
export function EmptyState({ icon = 'sparkles-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <Ionicons name={icon} size={36} color={colors.textMuted} />
      <Text style={[type.h2, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{text}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} compact /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  button: { minHeight: 54, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  buttonCompact: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.md },
  buttonLabel: { fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  iconButton: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
});
