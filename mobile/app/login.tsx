import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Screen } from '../components/ui';
import { Toggle } from '../components/form';
import { kvGet, kvSet } from '../database/kv';
import { PRIVACY_VERSION } from '../constants/privacy';
import { useAuth } from '../store/authStore';
import { spacing, colors, radius } from '../theme/tokens';

export default function Login() {
  const signIn = useAuth((s) => s.signInWithGoogle);
  const error = useAuth((s) => s.error);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  React.useEffect(() => { void kvGet('privacy.consent').then((v) => setAccepted(!!v && JSON.parse(v).version === PRIVACY_VERSION)); }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ width: 76, height: 76, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="barbell" size={42} color={colors.primaryText} /></View>
        <AppText variant="title">Gym & Nutrition Tracker</AppText>
        <AppText muted>Treino, nutrição e evolução num só lugar. Funciona offline e sincroniza quando tiveres ligação.</AppText>
        <Toggle label="Li e aceito o tratamento dos meus dados" value={accepted} onChange={setAccepted} />
        <Button
          label="Continuar com Google"
          loading={busy}
          disabled={!accepted}
          onPress={async () => { setBusy(true); try { await kvSet('privacy.consent', JSON.stringify({ version: PRIVACY_VERSION, at: Date.now() })); await signIn(); } finally { setBusy(false); } }}
        />
        {error ? <AppText variant="small" style={{ color: colors.danger }}>{error}</AppText> : null}
                <Button compact label="Ler a política de privacidade" variant="ghost" onPress={() => router.push('/privacy')} />
        <AppText variant="small" muted>Podes exportar ou eliminar a tua conta e dados a qualquer momento em Definições.</AppText>
      </ScrollView>
    </Screen>
  );
}
