import React, { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AI_SCOPES, type AiScope, type AiTask, type Insight } from '@gym/shared';
import { AppText, Button, Card, IconButton, Screen, ScreenHeader, Sheet } from '../components/ui';
import { Chip, ChipRow } from '../components/form';
import { ProposalCard } from '../components/ProposalCard';
import { useAuth } from '../store/authStore';
import { aiChat, aiStatus, describeAiError, type AiStatus } from '../services/aiApi';
import { acceptConsent, CONSENT_POINTS, getConsent, revokeConsent, setScopes, type Consent } from '../features/ai/consent';
import { addMessage, clearHistory, listMessages, type AiMessage } from '../features/ai/aiRepo';
import { buildContext, type AiContext } from '../features/ai/context';
import { localInsights } from '../features/ai/insights';
import { colors, radius, spacing } from '../theme/tokens';

const SCOPE_LABEL: Record<AiScope, string> = { training: 'Treino', nutrition: 'Nutrição', body: 'Corpo' };
const QUICK: { label: string; task: AiTask; text: string; scopes: AiScope[]; fill?: boolean }[] = [
  { label: 'Analisar progressão', task: 'analyze_progress', text: 'Analisa a minha progressão de cargas e diz-me o que fazer a seguir.', scopes: ['training'] },
  { label: 'Volume semanal', task: 'weekly_volume', text: 'Como está o meu volume semanal por músculo? Onde devo melhorar?', scopes: ['training'] },
  { label: 'Criar plano', task: 'create_plan', text: 'Cria-me um plano de treino para o objetivo de ... com ... dias por semana.', scopes: ['training', 'body'], fill: true },
  { label: 'Alternativas', task: 'alternatives', text: 'Sugere alternativas ao exercício: ', scopes: ['training'], fill: true },
  { label: 'Rever nutrição', task: 'nutrition_review', text: 'Analisa a minha consistência e os meus objetivos nutricionais.', scopes: ['nutrition', 'body'] },
];

export default function Coach() {
  const user = useAuth((s) => s.user)!;
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [scopes, setScopesState] = useState<Record<AiScope, boolean>>({ training: true, nutrition: true, body: true });
  const [task, setTask] = useState<AiTask>('chat');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ ctx: AiContext; bytes: number } | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const reload = useCallback(async () => {
    const c = await getConsent(user.id); setConsent(c); if (c) setScopesState(c.scopes);
    setMessages(await listMessages(user.id)); setInsights(await localInsights(user.id));
    aiStatus().then(setStatus).catch(() => setStatus(null)); // offline/sem IA: a app continua a funcionar
  }, [user.id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const chosen = () => AI_SCOPES.filter((s) => scopes[s]);
  const ctxFor = (t: AiTask) => buildContext(user.id, chosen(), { includeCatalog: t === 'create_plan' || t === 'alternatives' });

  const send = async () => {
    const text = input.trim(); if (!text || loading) return;
    setError(null); setLoading(true);
    try {
      const ctx = await ctxFor(task);
      const userMsg = await addMessage(user.id, { role: 'user', content: text });
      setInput(''); setMessages((m) => [...m, userMsg]);
      const history = [...messages, userMsg].slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const r = await aiChat({ task, messages: history, context: ctx.scopes.length ? { scopes: ctx.scopes, data: ctx.data } : undefined });
      await addMessage(user.id, { role: 'assistant', content: r.reply, proposal: r.proposal });
      setStatus((s) => (s ? { ...s, chat: { used: r.usage.used, limit: r.usage.limit } } : s)); setTask('chat');
      setMessages(await listMessages(user.id));
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { setError(describeAiError(e)); } finally { setLoading(false); }
  };

  const showData = async () => { const ctx = await ctxFor(task); setPreview({ ctx, bytes: Buffer.byteLength(JSON.stringify(ctx.data)) }); };
  const toggleScope = async (s: AiScope) => { const next = { ...scopes, [s]: !scopes[s] }; setScopesState(next); await setScopes(user.id, next); };

  return (
    <Screen>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Treinador IA" right={<IconButton name="camera-outline" label="Foto de refeição" onPress={() => router.push('/nutrition/meal-photo')} />} />

        <Card style={{ gap: spacing.xs }}>
          <AppText variant="h2">Análise local</AppText>
          <AppText variant="small" muted>Calculada no teu telemóvel, sem IA e sem internet.</AppText>
          {insights.length === 0 ? <AppText muted>Sem sugestões por agora. Regista treinos e refeições para receberes análises.</AppText> : insights.map((i) => <AppText key={i.id}>• {i.text}</AppText>)}
        </Card>

        {consent === undefined ? null : consent === null ? (
          <Card style={{ gap: spacing.sm, borderColor: colors.warning }}>
            <AppText variant="h2">Antes de usares a IA</AppText>
            {CONSENT_POINTS.map((p, i) => <AppText key={i} variant="small">• {p}</AppText>)}
            <Button label="Aceito e quero usar o Treinador IA" onPress={async () => { setConsent(await acceptConsent(user.id)); void reload(); }} />
          </Card>
        ) : (
          <>
            {status && !status.enabled && <Card style={{ borderColor: colors.warning }}><AppText>O Treinador IA não está configurado neste servidor. A análise local continua disponível.</AppText></Card>}
            {status?.enabled && <AppText variant="small" muted>Hoje: {status.chat.used}/{status.chat.limit} pedidos · {status.costNote}</AppText>}

            <ChipRow>{QUICK.map((q) => <Chip key={q.label} label={q.label} selected={task === q.task} onPress={() => { setTask(q.task); setInput(q.text); setScopesState({ training: q.scopes.includes('training'), nutrition: q.scopes.includes('nutrition'), body: q.scopes.includes('body') }); if (!q.fill) setTimeout(() => void 0, 0); }} />)}</ChipRow>
            <AppText variant="small" muted>Dados a incluir neste pedido:</AppText>
            <ChipRow>{AI_SCOPES.map((s) => <Chip key={s} label={SCOPE_LABEL[s]} selected={scopes[s]} onPress={() => void toggleScope(s)} />)}<Chip label="Ver o que será enviado" onPress={() => void showData()} /></ChipRow>

            {messages.map((m) => (
              <View key={m.id} style={{ gap: spacing.sm }}>
                <View style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%', backgroundColor: m.role === 'user' ? colors.primary : colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: m.role === 'user' ? 0 : 1, borderColor: colors.border }}>
                  <AppText style={{ color: m.role === 'user' ? colors.primaryText : colors.text }}>{m.content}</AppText>
                </View>
                {m.proposal && <ProposalCard userId={user.id} messageId={m.id} proposal={m.proposal} status={m.proposalStatus} onChanged={() => void listMessages(user.id).then(setMessages)} />}
              </View>
            ))}
            {loading && <AppText muted>O treinador está a pensar…</AppText>}
            {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}

            <TextInput accessibilityLabel="Mensagem" value={input} onChangeText={setInput} multiline placeholder="Pergunta ou pede um plano…" placeholderTextColor={colors.textMuted} maxLength={4000}
              style={{ minHeight: 56, maxHeight: 160, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: spacing.md, fontSize: 16 }} />
            <Button label="Enviar" loading={loading} disabled={!input.trim() || status?.enabled === false} onPress={() => void send()} />
            <AppText variant="small" muted>Sugestões automáticas, não aconselhamento médico. A IA nunca altera os teus planos sem tu aprovares.</AppText>

            <Button compact label="Apagar histórico de conversas" variant="ghost" onPress={() => Alert.alert('Apagar histórico', 'Apagar todas as conversas deste dispositivo?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Apagar', style: 'destructive', onPress: async () => { await clearHistory(user.id); setMessages([]); } }])} />
            <Button compact label="Revogar consentimento da IA" variant="ghost" onPress={() => Alert.alert('Revogar consentimento', 'Deixas de poder enviar pedidos à IA até aceitares de novo.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Revogar', style: 'destructive', onPress: async () => { await revokeConsent(user.id); setConsent(null); } }])} />
          </>
        )}
      </ScrollView>

      <Sheet visible={!!preview} title="Dados que serão enviados" onClose={() => setPreview(null)}>
            <AppText variant="small" muted>{preview ? `${(preview.bytes / 1024).toFixed(1)} KB · âmbitos: ${preview.ctx.scopes.map((s) => SCOPE_LABEL[s]).join(', ') || 'nenhum'} · sem nome nem email` : ''}</AppText>
            <AppText variant="small" style={{ fontFamily: 'monospace' }}>{preview ? JSON.stringify(preview.ctx.data, null, 2) : ''}</AppText>
      </Sheet>
    </Screen>
  );
}
