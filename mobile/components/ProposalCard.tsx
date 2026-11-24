import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { DiffItem, PlanProposal } from '@gym/shared';
import { AppText, Button, Card } from './ui';
import { applyProposal, buildProposalDiff, resolveProposal, type ApplyResult, type ResolvedProposal } from '../features/ai/proposals';
import { setProposalStatus, type ProposalStatus } from '../features/ai/aiRepo';
import { colors, spacing } from '../theme/tokens';

const ICON: Record<DiffItem['kind'], string> = { new_day: '＋', add: '＋', remove: '−', change: '~' };
const COLOR: Record<DiffItem['kind'], string> = { new_day: colors.accent, add: colors.primary, remove: colors.danger, change: colors.warning };

/** Mostra o que a proposta acrescenta/remove/altera. NADA é aplicado sem tocar em "Aplicar". */
export function ProposalCard({ userId, messageId, proposal, status, onChanged }: { userId: string; messageId: string; proposal: PlanProposal; status: ProposalStatus | null; onChanged: () => void }) {
  const [rp, setRp] = useState<ResolvedProposal | null>(null);
  const [diff, setDiff] = useState<{ items: DiffItem[]; targetPlanName: string | null; warnings: string[] } | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void (async () => { const r = await resolveProposal(userId, proposal); setRp(r); setDiff(await buildProposalDiff(userId, r)); })(); }, [userId, proposal]);

  const apply = async () => {
    if (!rp) return;
    try { setBusy(true); setError(null); const res = await applyProposal(userId, rp); setResult(res); await setProposalStatus(userId, messageId, 'accepted'); onChanged(); }
    catch { setError('Não foi possível aplicar a proposta por completo. O plano pode ter ficado parcialmente alterado: verifica-o em Planos.'); }
    finally { setBusy(false); }
  };
  const reject = async () => { await setProposalStatus(userId, messageId, 'rejected'); onChanged(); };

  const days = Array.from(new Set(diff?.items.map((i) => i.day) ?? []));
  return (
    <Card style={{ gap: spacing.sm, borderColor: status === 'accepted' ? colors.primary : status === 'rejected' ? colors.border : colors.accent }}>
      <AppText variant="small" style={{ color: colors.accent }}>PROPOSTA DE PLANO — {status === 'accepted' ? 'APLICADA' : status === 'rejected' ? 'REJEITADA' : 'PENDENTE DA TUA APROVAÇÃO'}</AppText>
      <AppText variant="h2">{proposal.planName}</AppText>
      <AppText variant="small" muted>{diff?.targetPlanName ? `Altera o plano “${diff.targetPlanName}” (só os dias indicados)` : 'Cria um plano novo'}</AppText>
      {proposal.rationale ? <AppText muted>{proposal.rationale}</AppText> : null}
      {!diff ? <AppText muted>A preparar alterações…</AppText> : days.map((d) => (
        <View key={d} style={{ gap: 2 }}>
          <AppText style={{ fontWeight: '600' }}>{d}</AppText>
          {diff.items.filter((i) => i.day === d).map((i, k) => (
            <AppText key={k} variant="small"><AppText variant="small" style={{ color: COLOR[i.kind], fontWeight: '700' }}>{ICON[i.kind]} </AppText>{i.exercise ? `${i.exercise}: ` : ''}{i.detail}</AppText>
          ))}
        </View>
      ))}
      {diff && diff.items.length === 0 && <AppText muted>Sem diferenças em relação ao plano atual.</AppText>}
      {diff?.warnings.map((w, i) => <AppText key={i} variant="small" style={{ color: colors.warning }}>⚠ {w}</AppText>)}
      {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
      {result && <AppText style={{ color: colors.primary }}>Aplicado: {result.added} exercício(s){result.createdCustom ? `, ${result.createdCustom} criado(s) como personalizado(s)` : ''}{result.ignored.length ? `, ${result.ignored.length} ignorado(s)` : ''}.</AppText>}
      {status === 'pending' && (
        <View style={{ gap: spacing.sm }}>
          <Button label="Aplicar alterações" loading={busy} disabled={!rp || !diff} onPress={() => void apply()} />
          <Button label="Rejeitar" variant="secondary" onPress={() => void reject()} />
        </View>
      )}
      {status === 'accepted' && <Button label="Ver planos" variant="secondary" onPress={() => router.push(result ? { pathname: '/plans/[id]', params: { id: result.planId } } : '/plans')} />}
    </Card>
  );
}
