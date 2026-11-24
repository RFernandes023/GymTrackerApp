import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Screen } from '../components/ui';
import { Toggle } from '../components/form';
import { kvGet, kvSet } from '../database/kv';
import { PRIVACY_VERSION } from '../constants/privacy';
import { useAuth } from '../store/authStore';
import { spacing, colors } from '../theme/tokens';

export default function Login() {
  const signIn = useAuth((s) => s.signInWithGoogle);
  const error = useAuth((s) => s.error);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  React.useEffect(() => { void kvGet('privacy.consent').then((v) => setAccepted(!!v && JSON.parse(v).version === PRIVACY_VERSION)); }, []);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title">Gym & Nutrition Tracker</AppText>
        <AppText muted>Treino, nutrição e evolução num só lugar. Funciona offline e sincroniza quando tiveres ligação.</AppText>
        <View style={{ height: spacing.xl }} />
        <Button
          label="Continuar com Google"
          loading={busy}
          disabled={!accepted}
          onPress={async () => { setBusy(true); try { await kvSet('privacy.consent', JSON.stringify({ version: PRIVACY_VERSION, at: Date.now() })); await signIn(); } finally { setBusy(false); } }}
        />
        {error ? <AppText variant="small" style={{ color: colors.danger }}>{error}</AppText> : null}
        <Toggle label="Li e aceito o tratamento dos meus dados" value={accepted} onChange={setAccepted} />
        <Button label="Ler a política de privacidade" variant="secondary" onPress={() => router.push('/privacy')} />
        <AppText variant="small" muted>Podes exportar ou eliminar a tua conta e dados a qualquer momento em Definições.</AppText>
      </View>
    </Screen>
  );
}
