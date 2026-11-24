import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Card, ListGroup, ListRow, Screen, ScreenHeader, SectionTitle } from '../components/ui';
import { useAuth } from '../store/authStore';
import { NetworkError } from '../services/api';
import { colors, spacing } from '../theme/tokens';

export default function Settings() {
  const { user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  const confirmSignOut = () => Alert.alert('Terminar sessão?', 'Vais precisar de internet para voltar a entrar.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Terminar sessão', style: 'destructive', onPress: () => void signOut() }]);
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
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <ScreenHeader title="Definições" />
        <Card style={{ gap: 2 }}>
          <AppText variant="h2">{user?.name}</AppText>
          <AppText muted>{user?.email}</AppText>
        </Card>
        <SectionTitle>Preferências</SectionTitle>
        <ListGroup>
          <ListRow icon="body-outline" title="Perfil corporal" sub="Altura, peso e experiência" onPress={() => router.push('/profile')} />
          <ListRow icon="notifications-outline" color={colors.warning} title="Notificações" onPress={() => router.push('/notifications')} />
        </ListGroup>
        <SectionTitle>Dados</SectionTitle>
        <ListGroup>
          <ListRow icon="cloud-outline" color={colors.accent} title="Sincronização" onPress={() => router.push('/sync')} />
          <ListRow icon="download-outline" color={colors.accent} title="Importar plano (JSON)" onPress={() => router.push('/import-plan')} />
          <ListRow icon="share-outline" color={colors.accent} title="Exportar dados" onPress={() => router.push('/export')} />
          <ListRow icon="shield-checkmark-outline" color={colors.purple} title="Política de privacidade" onPress={() => router.push('/privacy')} />
        </ListGroup>
        <View style={{ height: spacing.lg }} />
        <Button label="Terminar sessão" variant="secondary" icon="log-out-outline" onPress={confirmSignOut} />
        <Button label="Eliminar conta e dados" variant="danger" loading={busy} onPress={confirmDelete} />
      </ScrollView>
    </Screen>
  );
}
