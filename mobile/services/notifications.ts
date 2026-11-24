import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { REST_NOTIFICATION_ID, restNotification, type ScheduledItem } from '@gym/shared';
import { buildReminders, getPrefs } from '../features/notifications/reminders';

const CH_REST = 'rest-timer', CH_REMINDERS = 'reminders';

/** Chamar uma vez no arranque: canais Android e comportamento em primeiro plano. */
export async function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      // com a app aberta o ecrã de treino já vibra: não duplicar o aviso do descanso
      const hideRest = n.request.content.data?.kind === 'rest' && AppState.currentState === 'active';
      return { shouldShowBanner: !hideRest, shouldShowList: !hideRest, shouldPlaySound: !hideRest, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CH_REST, { name: 'Descanso entre séries', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 300, 150, 300] });
    await Notifications.setNotificationChannelAsync(CH_REMINDERS, { name: 'Lembretes', importance: Notifications.AndroidImportance.DEFAULT });
  }
}

export async function permissionGranted(): Promise<boolean> { return (await Notifications.getPermissionsAsync()).granted; }
/** Pede permissão só quando é preciso (nunca no arranque sem motivo). */
export async function ensurePermission(): Promise<boolean> {
  if (await permissionGranted()) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

const toTrigger = (t: ScheduledItem['trigger'], channelId: string): Notifications.NotificationTriggerInput =>
  t.type === 'weekly' ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: t.weekday, hour: t.hour, minute: t.minute, channelId }
  : t.type === 'daily' ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: t.hour, minute: t.minute, channelId }
  : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t.at), channelId };

/** Cancela os lembretes antigos e agenda os atuais (idempotente; chamar ao mudar preferências, plano ou treinar). */
export async function applyReminders(userId: string): Promise<number> {
  const items = await buildReminders(userId);
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) if (n.identifier.startsWith('rem:')) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  if (items.length === 0 || !(await ensurePermission())) return 0;
  for (const it of items) await Notifications.scheduleNotificationAsync({ identifier: it.id, content: { title: it.title, body: it.body, data: { kind: it.kind } }, trigger: toTrigger(it.trigger, CH_REMINDERS) });
  return items.length;
}

/** Aviso do fim do descanso (dispara mesmo com o ecrã bloqueado). Substitui o anterior. */
export async function scheduleRest(userId: string, endsAt: number) {
  await cancelRest();
  const n = restNotification(await getPrefs(userId), endsAt, Date.now());
  if (!n || !(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({ identifier: n.id, content: { title: n.title, body: n.body, data: { kind: 'rest' }, sound: 'default' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(n.at), channelId: CH_REST } });
}
export async function cancelRest() { try { await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID); } catch { /* não havia */ } }

export async function sendTestNotification() {
  if (!(await ensurePermission())) return false;
  await Notifications.scheduleNotificationAsync({ content: { title: 'Teste', body: 'As notificações estão a funcionar.', data: { kind: 'test' } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CH_REMINDERS } });
  return true;
}
