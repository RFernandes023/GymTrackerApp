import React, { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { groupRows, labelToPer100, parseNutritionLabel, validatePer100, type LabelBasis, type LabelResult, type LabelValues } from '@gym/shared';
import { AppText, Button, Card, Screen, ScreenHeader } from '../../components/ui';
import { Chip, ChipRow, Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { saveFood } from '../../features/nutrition/foodsRepo';
import { deleteTempImage } from '../../services/tempFiles';
import { colors, radius, spacing } from '../../theme/tokens';

const BASIS: [LabelBasis, string][] = [['per100g', 'por 100 g'], ['per100ml', 'por 100 ml'], ['perServing', 'por dose'], ['perUnit', 'por unidade']];
const FIELDS: [keyof LabelValues, string][] = [['kcal', 'Calorias (kcal)'], ['fat', 'Gorduras (g)'], ['satFat', 'Saturados (g)'], ['carbs', 'Hidratos (g)'], ['sugars', 'Açúcares (g)'], ['fiber', 'Fibra (g)'], ['protein', 'Proteínas (g)'], ['salt', 'Sal (g)']];
const toStr = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export default function LabelScan() {
  const user = useAuth((s) => s.user)!;
  const p = useLocalSearchParams<{ date?: string; meal?: string; recipeTarget?: string }>();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabelResult | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [basis, setBasis] = useState<LabelBasis | null>(null);
  const [serving, setServing] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const capture = async () => {
    setBusy(true); setError(null);
    let uri: string | undefined;
    try {
      const photo = await cam.current?.takePictureAsync({ quality: 0.8, skipProcessing: true });
      uri = photo?.uri;
      if (!uri) throw new Error('sem foto');
      const ocr = await TextRecognition.recognize(uri); // no dispositivo; a imagem não sai do telemóvel
      const rows = groupRows(ocr.blocks.flatMap((b) => b.lines).map((l) => ({ text: l.text, frame: l.frame ? { top: l.frame.top, left: l.frame.left, height: l.frame.height } : undefined })));
      const r = parseNutritionLabel(rows);
      setResult(r); setBasis(r.basis); setServing(toStr(r.servingSize));
      setVals(Object.fromEntries(FIELDS.map(([k]) => [k, toStr(r.values[k])])));
    } catch { setError('Não foi possível ler a imagem. Tenta com mais luz e a tabela bem enquadrada, ou introduz os valores manualmente.'); }
    finally { await deleteTempImage(uri); setBusy(false); } // a fotografia é apagada de imediato
  };

  const values = (): LabelValues => Object.fromEntries(FIELDS.map(([k]) => [k, toNum(vals[k] ?? '')])) as unknown as LabelValues;
  const needsServing = basis === 'perServing' || basis === 'perUnit';
  const servingNum = toNum(serving);
  const per100 = basis ? labelToPer100(values(), basis, servingNum) : null;
  const check = per100 && per100.kcal !== null && per100.protein !== null && per100.carbs !== null && per100.fat !== null
    ? validatePer100({ kcal: per100.kcal, protein: per100.protein, carbs: per100.carbs, fat: per100.fat, satFat: per100.satFat, sugars: per100.sugars, fiber: per100.fiber, salt: per100.salt }) : null;
  const missing = per100 ? (['kcal', 'protein', 'carbs', 'fat'] as const).filter((k) => per100[k] === null) : [];

  const save = async () => {
    if (!per100 || !basis || missing.length || (check && check.errors.length) || !name.trim()) return;
    try {
      const baseUnit = basis === 'per100ml' ? 'ml' : 'g';
      const f = await saveFood(user.id, {
        name, brand: null, barcode: null, baseUnit, source: 'label_ocr', unitWeight: basis === 'perUnit' ? servingNum : null,
        servingSize: basis === 'perServing' ? servingNum : null, servingLabel: basis === 'perServing' && servingNum ? `${servingNum} ${baseUnit}` : null,
        per100: { kcal: per100.kcal!, protein: per100.protein!, carbs: per100.carbs!, fat: per100.fat!, satFat: per100.satFat, sugars: per100.sugars, fiber: per100.fiber, salt: per100.salt },
      });
      router.replace({ pathname: '/nutrition/log', params: { foodId: f.id, date: p.date, meal: p.meal, ...(p.recipeTarget ? { recipeTarget: p.recipeTarget } : {}) } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Rótulo" />
        {!result ? (
          <>
            {!perm ? <AppText muted>A verificar permissões…</AppText> : !perm.granted ? (
              <View style={{ gap: spacing.md }}><AppText>É necessária permissão da câmara para fotografar a tabela nutricional.</AppText><Button label="Permitir câmara" onPress={() => void requestPerm()} /></View>
            ) : (
              <View style={{ height: 380, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                <CameraView ref={cam} style={{ flex: 1 }} facing="back" />
              </View>
            )}
            <Button label="Fotografar e ler" loading={busy} disabled={!perm?.granted} onPress={() => void capture()} />
            <Button label="Introduzir manualmente" variant="secondary" onPress={() => { setResult({ basis: null, servingSize: null, values: { kcal: null, fat: null, satFat: null, carbs: null, sugars: null, protein: null, fiber: null, salt: null }, warnings: [] }); }} />
            <AppText variant="small" muted>O texto é lido no próprio dispositivo (Google ML Kit). A fotografia não é enviada para a cloud e é apagada logo a seguir.</AppText>
          </>
        ) : (
          <>
            <Card style={{ gap: spacing.xs }}>
              <AppText variant="h2">Confirma os valores</AppText>
              <AppText variant="small" muted>A leitura automática pode errar. Nada é guardado até confirmares.</AppText>
              {result.warnings.map((w, i) => <AppText key={i} variant="small" style={{ color: colors.warning }}>⚠ {w}</AppText>)}
            </Card>
            <Field label="Nome do alimento" value={name} onChangeText={setName} />
            <AppText variant="small" muted>Os valores do rótulo são…</AppText>
            <ChipRow>{BASIS.map(([k, l]) => <Chip key={k} label={l} selected={basis === k} onPress={() => setBasis(k)} />)}</ChipRow>
            {needsServing && <Field label={basis === 'perUnit' ? 'Peso de uma unidade (g)' : 'Tamanho da dose (g)'} value={serving} onChangeText={setServing} keyboardType="decimal-pad" />}
            {FIELDS.map(([k, l]) => <Field key={k} label={l} value={vals[k] ?? ''} onChangeText={(t) => setVals((v) => ({ ...v, [k]: t }))} keyboardType="decimal-pad" />)}
            {basis && needsServing && !per100 && <AppText style={{ color: colors.warning }}>Indica o tamanho da dose/unidade para converter para 100 g.</AppText>}
            {per100 && <Card style={{ gap: 2 }}><AppText variant="small" muted>Será guardado por 100 {basis === 'per100ml' ? 'ml' : 'g'}</AppText><AppText>{per100.kcal ?? '—'} kcal · P {per100.protein ?? '—'} · H {per100.carbs ?? '—'} · G {per100.fat ?? '—'}</AppText></Card>}
            {missing.length > 0 && <AppText style={{ color: colors.warning }}>Faltam valores obrigatórios: calorias, proteínas, hidratos e gorduras.</AppText>}
            {check?.errors.map((e, i) => <AppText key={i} style={{ color: colors.danger }}>{e}</AppText>)}
            {check?.warnings.map((e, i) => <AppText key={i} style={{ color: colors.warning }}>⚠ {e}</AppText>)}
            {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
            <Button label="Confirmar e guardar" disabled={!basis || !name.trim() || !per100 || missing.length > 0 || !!check?.errors.length} onPress={() => void save()} />
            <Button label="Voltar a fotografar" variant="secondary" onPress={() => { setResult(null); setError(null); }} />
          </>
        )}
        {error && !result ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
      </ScrollView>
    </Screen>
  );
}
