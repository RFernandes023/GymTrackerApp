import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Card, Screen, BackLink } from '../components/ui';
import { useAuth } from '../store/authStore';
import { NetworkError } from '../services/api';
import { spacing } from '../theme/tokens';

export default function Settings() {
  const { user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  const confirmDelete = () =>
    Alert.alert(
      'Eliminar conta',
      'Todos os teus dados na cloud e neste dispositivo serão apagados de forma permanente. Requer ligação à internet.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try { await deleteAccount(); }
            catch (e) {
              Alert.alert('Não foi possível eliminar', e instanceof NetworkError ? 'Sem ligação ao servidor. Tenta novamente com internet.' : 'Ocorreu um erro. Tenta novamente.');
            } finally { setBusy(false); }
          },
        },
      ],
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <BackLink />
        <AppText variant="title">Definições</AppText>
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="h2">{user?.name}</AppText>
          <AppText muted>{user?.email}</AppText>
        </Card>
        <Button label="Perfil corporal" variant="secondary" onPress={() => router.push('/profile')} />
        <Button label="Política de privacidade" variant="secondary" onPress={() => router.push('/privacy')} />
        <Button label="Notificações" variant="secondary" onPress={() => router.push('/notifications')} />
        <Button label="Sincronização" variant="secondary" onPress={() => router.push('/sync')} />
        <Button label="Importar plano (JSON)" variant="secondary" onPress={() => router.push('/import-plan')} />
        <Button label="Exportar dados" variant="secondary" onPress={() => router.push('/export')} />
        <Button label="Terminar sessão" variant="secondary" onPress={() => void signOut()} />
        <Button label="Eliminar conta e dados" variant="danger" loading={busy} onPress={confirmDelete} />
      </ScrollView>
    </Screen>
  );
}
