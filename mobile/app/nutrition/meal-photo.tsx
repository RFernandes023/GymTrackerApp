import React, { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { mealItemToPer100, rescaleMealItem, toDateKey, validatePer100, type MealItem } from '@gym/shared';
import { AppText, Button, Card, Screen, ScreenHeader } from '../../components/ui';
import { Chip, ChipRow, Field, Stepper } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { aiMealPhoto, describeAiError } from '../../services/aiApi';
import { deleteTempImage } from '../../services/tempFiles';
import { getConsent } from '../../features/ai/consent';
import { saveFood, searchFoods } from '../../features/nutrition/foodsRepo';
import { getCustomMeals, logFood } from '../../features/nutrition/nutritionRepo';
import { MEAL_TYPES, mealLabel } from '../../features/nutrition/types';
import { colors, radius, spacing } from '../../theme/tokens';

interface Row { orig: MealItem; cur: MealItem }

export default function MealPhoto() {
  const user = useAuth((s) => s.user)!;
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meal, setMeal] = useState('lunch');
  const [meals, setMeals] = useState<string[]>([...MEAL_TYPES]);
  const [error, setError] = useState<string | null>(null);

  const ask = () => new Promise<boolean>((resolve) => Alert.alert('Enviar fotografia?',
    'A fotografia será enviada ao servidor da app e daí a um serviço de IA externo (por defeito, Google Gemini) para estimar a refeição. Não é guardada por nós. No escalão gratuito do Gemini, a Google pode usar o conteúdo para melhorar os seus produtos.',
    [{ text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) }, { text: 'Enviar', onPress: () => resolve(true) }]));

  const capture = async () => {
    if (!(await getConsent(user.id))) { setError('Aceita primeiro o consentimento no separador Treinador IA.'); return; }
    if (!(await ask())) return;
    setBusy(true); setError(null);
    let uri: string | undefined;
    try {
      let photo = await cam.current?.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: true });
      uri = photo?.uri;
      if (photo?.base64 && photo.base64.length > 1_800_000) { await deleteTempImage(uri); photo = await cam.current?.takePictureAsync({ quality: 0.25, base64: true, skipProcessing: true }); uri = photo?.uri; }
      if (!photo?.base64) throw new Error('sem imagem');
      const r = await aiMealPhoto(photo.base64, 'image/jpeg');
      setRows(r.items.map((i) => ({ orig: i, cur: i })));
      setMeals([...MEAL_TYPES, ...(await getCustomMeals(user.id))]);
      if (r.items.length === 0) setError('Não foi possível identificar alimentos. Tenta com melhor luz ou adiciona manualmente.');
    } catch (e) { setError(describeAiError(e)); }
    finally { await deleteTempImage(uri); setBusy(false); } // a fotografia nunca fica no dispositivo
  };

  const issues = useMemo(() => (rows ?? []).map((r) => validatePer100(mealItemToPer100(r.cur)).errors[0] ?? null), [rows]);
  const total = (rows ?? []).reduce((a, r) => ({ kcal: a.kcal + r.cur.kcal, p: a.p + r.cur.protein, c: a.c + r.cur.carbs, f: a.f + r.cur.fat }), { kcal: 0, p: 0, c: 0, f: 0 });

  const confirm = async () => {
    if (!rows) return;
    try {
      const date = toDateKey(Date.now()); let n = 0;
      for (const [i, r] of rows.entries()) {
        if (issues[i]) continue;
        const name = `${r.cur.name} (estimativa IA)`;
        const existing = (await searchFoods(user.id, { query: name })).find((f) => f.name === name);
        const food = await saveFood(user.id, { id: existing?.id, name, brand: null, barcode: null, baseUnit: 'g', per100: mealItemToPer100(r.cur), servingSize: null, servingLabel: null, unitWeight: null, source: 'custom' });
        await logFood(user.id, { date, meal, food, quantity: r.cur.grams, unit: 'g' }); n++;
      }
      if (n === 0) { setError('Nenhum item válido para adicionar.'); return; }
      router.dismissTo('/(tabs)/nutrition');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Foto da refeição" />
        <Card style={{ borderColor: colors.warning }}><AppText>Os valores são ESTIMATIVAS aproximadas feitas por IA, não valores exatos. Corrige alimentos e quantidades antes de adicionar ao diário.</AppText></Card>

        {!rows ? (
          <>
            {!perm ? <AppText muted>A verificar permissões…</AppText> : !perm.granted ? (
              <View style={{ gap: spacing.md }}><AppText>É necessária permissão da câmara.</AppText><Button label="Permitir câmara" onPress={() => void requestPerm()} /></View>
            ) : <View style={{ height: 380, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}><CameraView ref={cam} style={{ flex: 1 }} facing="back" /></View>}
            <Button label="Fotografar e estimar" loading={busy} disabled={!perm?.granted} onPress={() => void capture()} />
            <AppText variant="small" muted>Pede sempre a tua autorização antes de enviar. A foto é apagada logo a seguir e não é guardada na cloud.</AppText>
          </>
        ) : (
          <>
            {rows.map((r, i) => (
              <Card key={i} style={{ gap: spacing.sm }}>
                <Field label="Alimento" value={r.cur.name} onChangeText={(t) => setRows(rows.map((x, k) => (k === i ? { ...x, cur: { ...x.cur, name: t } } : x)))} />
                <Stepper label="Quantidade (g)" value={r.cur.grams} step={10} min={5} max={2000} format={(n) => String(Math.round(n))} onChange={(g) => setRows(rows.map((x, k) => (k === i ? { ...x, cur: rescaleMealItem(x.orig, Math.round(g)) } : x)))} />
                <AppText>{Math.round(r.cur.kcal)} kcal · P {r.cur.protein} · H {r.cur.carbs} · G {r.cur.fat}</AppText>
                {issues[i] ? <AppText style={{ color: colors.danger }}>⚠ {issues[i]} Este item não será adicionado.</AppText> : null}
                <Button label="Remover item" variant="secondary" onPress={() => setRows(rows.filter((_, k) => k !== i))} />
              </Card>
            ))}
            <Card style={{ gap: 2 }}><AppText variant="small" muted>Total estimado</AppText><AppText variant="h2">{Math.round(total.kcal)} kcal</AppText><AppText muted>P {Math.round(total.p)} · H {Math.round(total.c)} · G {Math.round(total.f)}</AppText></Card>
            <ChipRow>{meals.map((m) => <Chip key={m} label={mealLabel(m)} selected={meal === m} onPress={() => setMeal(m)} />)}</ChipRow>
            {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
            <Button label="Adicionar ao diário" disabled={rows.length === 0} onPress={() => void confirm()} />
            <Button label="Tirar outra foto" variant="secondary" onPress={() => { setRows(null); setError(null); }} />
          </>
        )}
        {error && !rows ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
      </ScrollView>
    </Screen>
  );
}
