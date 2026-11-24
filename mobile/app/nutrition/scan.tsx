import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppText, Button, Screen, ScreenHeader } from '../../components/ui';
import { Field } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { findByBarcode, saveFood } from '../../features/nutrition/foodsRepo';
import { isValidBarcode, lookupBarcode } from '../../services/openFoodFacts';
import { colors, radius, spacing } from '../../theme/tokens';

export default function Scan() {
  const user = useAuth((s) => s.user)!;
  const p = useLocalSearchParams<{ date?: string; meal?: string; recipeTarget?: string }>();
  const [perm, requestPerm] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState<{ text: string; barcode: string } | null>(null);
  const lock = useRef(false);
  const ctx = { date: p.date, meal: p.meal, ...(p.recipeTarget ? { recipeTarget: p.recipeTarget } : {}) };

  const handle = async (raw: string) => {
    const code = raw.trim();
    if (lock.current || !isValidBarcode(code)) return;
    lock.current = true; setBusy(true); setMsg(null);
    try {
      const local = await findByBarcode(user.id, code); // funciona offline para produtos já conhecidos
      if (local) { router.replace({ pathname: '/nutrition/log', params: { foodId: local.id, ...ctx } }); return; }
      const r = await lookupBarcode(code);
      if (r.status === 'found') {
        const f = await saveFood(user.id, { ...r.draft, barcode: code, source: 'openfoodfacts' });
        router.replace({ pathname: '/nutrition/log', params: { foodId: f.id, ...ctx } }); return;
      }
      setMsg({ barcode: code, text: r.status === 'offline' ? 'Sem ligação à internet e o produto ainda não está guardado. Tenta novamente ou cria-o manualmente.' : r.status === 'incomplete' ? 'O produto existe no Open Food Facts mas sem dados nutricionais completos. Cria-o manualmente.' : r.status === 'not_found' ? 'Produto não encontrado no Open Food Facts. Podes criá-lo manualmente.' : 'Não foi possível consultar o Open Food Facts.' });
    } finally { setBusy(false); lock.current = false; }
  };

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.md, flex: 1 }}>
        <ScreenHeader title="Código de barras" />
        {!perm ? <AppText muted>A verificar permissões…</AppText> : !perm.granted ? (
          <View style={{ gap: spacing.md }}>
            <AppText>É necessária permissão da câmara para ler códigos de barras. Podes também escrever o código abaixo.</AppText>
            <Button label="Permitir câmara" onPress={() => void requestPerm()} />
          </View>
        ) : (
          <View style={{ height: 280, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={(r) => void handle(r.data)} />
          </View>
        )}
        {busy && <AppText muted>A procurar produto…</AppText>}
        {msg && (
          <View style={{ gap: spacing.sm }}>
            <AppText style={{ color: colors.warning }}>{msg.text}</AppText>
            <Button label="Criar manualmente" onPress={() => router.replace({ pathname: '/nutrition/food-form', params: { barcode: msg.barcode, ...ctx } })} />
            <Button label="Tentar novamente" variant="secondary" onPress={() => void handle(msg.barcode)} />
          </View>
        )}
        <Field label="Ou escreve o código" value={manual} onChangeText={setManual} keyboardType="number-pad" placeholder="8 a 14 dígitos" />
        <Button label="Procurar" variant="secondary" disabled={!isValidBarcode(manual)} onPress={() => void handle(manual)} />
        <AppText variant="small" muted>A consulta envia apenas o código de barras ao Open Food Facts.</AppText>
      </View>
    </Screen>
  );
}
