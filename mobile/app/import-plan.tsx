import React, { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { GOAL_LABELS, KNOWN_MUSCLES, parsePlanJson, splitBundle, type ImportPlan, type PlanGoal, SET_TYPE_LABELS } from '@gym/shared';
import { AppText, Button, Card, Screen, ScreenHeader } from '../components/ui';
import { Chip, ChipRow, Field } from '../components/form';
import { useAuth } from '../store/authStore';
import { getExercise } from '../features/workouts/exercisesRepo';
import { aiPlanInstructions, applyImport, defaultDecision, resolveImport, type Decision, type ImportResult, type ResolvedImportExercise } from '../features/exchange/planImport';
import { MUSCLE_LABELS } from '../features/workouts/types';
import { colors, radius, spacing } from '../theme/tokens';

const same = (a: Decision, b: Decision) => JSON.stringify(a) === JSON.stringify(b);

export default function ImportPlan() {
  const user = useAuth((s) => s.user)!;
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [bundle, setBundle] = useState<{ json: string; name: string; ok: boolean }[] | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [resolved, setResolved] = useState<ResolvedImportExercise[][]>([]);
  const [decisions, setDecisions] = useState<Decision[][]>([]);
  const [libNames, setLibNames] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<PlanGoal>('hypertrophy');
  const [dayNames, setDayNames] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validate = async (src = text) => {
    setErrors([]); setWarnings([]); setBundle(null); setResult(null);
    const parts = splitBundle(src);
    if (parts) {
      setBundle(parts.map((json) => { const r = parsePlanJson(json); return { json, ok: r.ok, name: r.ok ? r.plan.name : 'Plano inválido' }; }));
      return;
    }
    const r = parsePlanJson(src);
    if (!r.ok) { setErrors(r.errors); setPlan(null); return; } // JSON inválido nunca avança para a importação
    setBusy(true);
    const res = await resolveImport(user.id, r.plan);
    const names: Record<string, string> = {};
    for (const row of res) for (const x of row) {
      for (const id of [x.exerciseId, ...x.suggestions.map((s) => s.id)]) if (id && !names[id]) { const e = await getExercise(id); if (e) names[id] = e.namePt ?? e.nameEn; }
    }
    setLibNames(names); setResolved(res); setDecisions(res.map((row) => row.map(defaultDecision)));
    setPlan(r.plan); setName(r.plan.name); setGoal(r.plan.goal); setDayNames(r.plan.days.map((d) => d.name)); setWarnings(r.warnings); setBusy(false);
  };

  const setDecision = (di: number, ei: number, d: Decision) => setDecisions(decisions.map((row, i) => (i === di ? row.map((x, k) => (k === ei ? d : x)) : row)));
  const pasteIt = async () => { const t = await Clipboard.getStringAsync(); setText(t); if (t.trim()) await validate(t); };

  const copyForAi = async () => { await Clipboard.setStringAsync(await aiPlanInstructions(user.id)); setCopied(true); };

  const confirm = async () => {
    if (!plan) return;
    try { setBusy(true); setErrors([]); setResult(await applyImport(user.id, plan, decisions, { name, goal, dayNames })); }
    catch (e) { setErrors([e instanceof Error ? e.message : 'Não foi possível importar.']); }
    finally { setBusy(false); }
  };

  const summary = (x: ResolvedImportExercise) => {
    const w = x.ex.sets.filter((s) => s.type !== 'warmup'); const f = w[0] ?? x.ex.sets[0]!;
    const extras = [...new Set(x.ex.sets.map((s) => s.type).filter((t) => t !== 'working'))].map((t) => SET_TYPE_LABELS[t].toLowerCase());
    return `${x.ex.sets.length} série(s) · ${f.repMin === f.repMax ? f.repMin : `${f.repMin}–${f.repMax}`} reps${f.weight ? ` · ${f.weight} kg` : ''}${extras.length ? ` · ${extras.join(', ')}` : ''}`;
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Importar plano" />

        {result ? (
          <Card style={{ gap: spacing.sm, borderColor: colors.primary }}>
            <AppText variant="h2">Plano importado</AppText>
            <AppText>{result.exercises} exercício(s){result.customCreated ? ` · ${result.customCreated} criado(s) como personalizado(s)` : ''}{result.skipped.length ? ` · ignorados: ${result.skipped.join(', ')}` : ''}.</AppText>
            <Button label="Ver plano" onPress={() => router.replace({ pathname: '/plans/[id]', params: { id: result.planId } })} />
            <Button label="Importar outro" variant="secondary" onPress={() => { setResult(null); setPlan(null); setText(''); }} />
          </Card>
        ) : !plan ? (
          <>
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="h2">Pedir o plano a uma IA</AppText>
              <AppText variant="small" muted>Copia as instruções com todos os exercícios da app (e os teus), cola-as no ChatGPT, Gemini ou outra IA, e traz o JSON para aqui.</AppText>
              <Button compact icon={copied ? 'checkmark' : 'copy-outline'} label={copied ? 'Copiado' : 'Copiar instruções e exercícios'} variant="secondary" onPress={() => void copyForAi()} />
            </Card>
            <AppText variant="small" muted>Cola aqui um plano em JSON (formato versionado 1.0). Podes editar o texto antes de validar. Nada é importado sem validação e confirmação.</AppText>
            <TextInput value={text} onChangeText={setText} multiline autoCapitalize="none" autoCorrect={false} placeholder='{ "schemaVersion": "1.0", "type": "workout_plan", ... }' placeholderTextColor={colors.textMuted}
              style={{ minHeight: 220, maxHeight: 360, textAlignVertical: 'top', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: errors.length ? colors.danger : colors.border, color: colors.text, padding: spacing.md, fontFamily: 'monospace', fontSize: 13 }} />
            <Button label="Colar da área de transferência" variant="secondary" onPress={() => void pasteIt()} />
            <Button label="Validar e pré-visualizar" loading={busy} disabled={!text.trim()} onPress={() => void validate()} />
            {errors.length > 0 && (
              <Card style={{ gap: 2, borderColor: colors.danger }}>
                <AppText style={{ color: colors.danger, fontWeight: '600' }}>JSON inválido — corrige e valida de novo ({errors.length} erro{errors.length === 1 ? '' : 's'})</AppText>
                {errors.map((e, i) => <AppText key={i} variant="small">• {e}</AppText>)}
              </Card>
            )}
            {bundle && (
              <Card style={{ gap: spacing.sm }}>
                <AppText variant="h2">{bundle.length} plano(s) no ficheiro</AppText>
                {bundle.map((b, i) => <Button key={i} label={b.ok ? `Importar “${b.name}”` : 'Plano inválido (ignorado)'} variant="secondary" disabled={!b.ok} onPress={() => { setText(b.json); void validate(b.json); }} />)}
              </Card>
            )}
          </>
        ) : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="small" muted>Pré-visualização — podes editar antes de confirmar</AppText>
              <Field label="Nome do plano" value={name} onChangeText={setName} />
              <ChipRow>{(Object.keys(GOAL_LABELS) as PlanGoal[]).map((g) => <Chip key={g} label={GOAL_LABELS[g]} selected={goal === g} onPress={() => setGoal(g)} />)}</ChipRow>
              {plan.description ? <AppText variant="small" muted>{plan.description}</AppText> : null}
            </Card>
            {warnings.map((w, i) => <AppText key={i} variant="small" style={{ color: colors.warning }}>⚠ {w}</AppText>)}
            {plan.days.map((d, di) => (
              <Card key={di} style={{ gap: spacing.md }}>
                <Field label={`Dia ${di + 1}${d.dayOfWeek ? ` (dia da semana ${d.dayOfWeek})` : ''}`} value={dayNames[di] ?? ''} onChangeText={(t) => setDayNames(dayNames.map((x, i) => (i === di ? t : x)))} />
                {resolved[di]!.map((x, ei) => {
                  const dec = decisions[di]![ei]!;
                  const use = (id: string): Decision => ({ kind: 'use', exerciseId: id });
                  return (
                    <View key={ei} style={{ gap: spacing.xs, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md }}>
                      <AppText style={{ fontWeight: '600' }}>{x.ex.displayName}</AppText>
                      <AppText variant="small" muted>{summary(x)}</AppText>
                      <AppText variant="small" style={{ color: x.status === 'matched' ? colors.primary : colors.warning }}>{x.status === 'matched' ? 'Encontrado na biblioteca' : x.status === 'new' ? 'Não existe na biblioteca' : 'Não existe e falta o músculo'}</AppText>
                      <ChipRow>
                        {x.exerciseId && <Chip label={`Usar: ${libNames[x.exerciseId] ?? '…'}`} selected={same(dec, use(x.exerciseId))} onPress={() => setDecision(di, ei, use(x.exerciseId!))} />}
                        {x.suggestions.filter((s) => s.id !== x.exerciseId).map((s) => <Chip key={s.id} label={`Sugestão: ${libNames[s.id] ?? s.name}`} selected={same(dec, use(s.id))} onPress={() => setDecision(di, ei, use(s.id))} />)}
                        {x.ex.primary[0] && <Chip label="Criar personalizado" selected={dec.kind === 'create'} onPress={() => setDecision(di, ei, { kind: 'create', muscle: x.ex.primary[0]!, equipment: x.ex.equipment ?? 'other' })} />}
                        <Chip label="Ignorar" selected={dec.kind === 'skip'} onPress={() => setDecision(di, ei, { kind: 'skip' })} />
                      </ChipRow>
                      {!x.ex.primary[0] && x.status === 'unresolved' && (
                        <><AppText variant="small" muted>Ou cria como personalizado — escolhe o músculo principal:</AppText>
                          <ChipRow>{KNOWN_MUSCLES.map((m) => <Chip key={m} label={MUSCLE_LABELS[m] ?? m} selected={dec.kind === 'create' && dec.muscle === m} onPress={() => setDecision(di, ei, { kind: 'create', muscle: m, equipment: x.ex.equipment ?? 'other' })} />)}</ChipRow></>
                      )}
                    </View>
                  );
                })}
              </Card>
            ))}
            {errors.map((e, i) => <AppText key={i} style={{ color: colors.danger }}>{e}</AppText>)}
            <Button label="Confirmar importação" loading={busy} disabled={!name.trim()} onPress={() => void confirm()} />
            <Button label="Voltar ao texto" variant="secondary" onPress={() => { setPlan(null); setErrors([]); }} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
