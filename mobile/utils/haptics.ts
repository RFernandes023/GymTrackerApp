import * as Haptics from 'expo-haptics';

/** Háptica nunca pode falhar o fluxo (dispositivos sem motor, definições do sistema…). */
const safe = (fn: () => Promise<void>) => { void fn().catch(() => {}); };
export const tapHaptic = () => safe(() => Haptics.selectionAsync());
export const successHaptic = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const warnHaptic = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
