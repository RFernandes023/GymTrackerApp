// Mocks dos módulos nativos para renderizar ecrãs REAIS em Node, ligados a uma base SQLite de teste.
const params: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() },
    useLocalSearchParams: () => params.current,
    useFocusEffect: (cb: () => void | (() => void)) => { React.useEffect(cb, []); }, // eslint-disable-line react-hooks/exhaustive-deps
    __setParams: (p: Record<string, string>) => { params.current = p; },
  };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }));
jest.mock('expo-image', () => { const { View } = require('react-native'); const React = require('react'); const Image = (p: any) => React.createElement(View, { testID: 'expo-image', accessibilityLabel: p.accessibilityLabel, source: p.source, autoplay: p.autoplay }); Image.prefetch = jest.fn(async () => true); return { Image }; });
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn(async () => true), signIn: jest.fn(), signOut: jest.fn(async () => {}), revokeAccess: jest.fn(async () => {}) }, isSuccessResponse: () => false }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-camera', () => ({ CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }, jest.fn()] }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(async () => (global as any).__clipboard ?? ''), setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', getInfoAsync: jest.fn(async () => ({ exists: false })), readDirectoryAsync: jest.fn(async () => []), deleteAsync: jest.fn(async () => {}), makeDirectoryAsync: jest.fn(async () => {}), writeAsStringAsync: jest.fn(async () => {}) }));
jest.mock('@react-native-ml-kit/text-recognition', () => ({ __esModule: true, default: { recognize: jest.fn(async () => ({ text: '', blocks: [] })) } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../services/notifications', () => ({ configureNotifications: jest.fn(async () => {}), applyReminders: jest.fn(async () => 0), scheduleRest: jest.fn(async () => {}), cancelRest: jest.fn(async () => {}), permissionGranted: jest.fn(async () => true), ensurePermission: jest.fn(async () => true), sendTestNotification: jest.fn(async () => true) }));
jest.mock('../services/api', () => {
  class ApiError extends Error { status: number; code: string; constructor(status: number, code: string) { super('API ' + status + ': ' + code); this.status = status; this.code = code; } }
  class NetworkError extends Error {}
  return { ApiError, NetworkError, API_URL: 'http://test', apiFetch: jest.fn(async () => { throw new NetworkError('offline'); }), loginWithGoogleIdToken: jest.fn(), logoutRemote: jest.fn(), refreshSession: jest.fn() };
});
jest.mock('../database/db', () => ({ getDb: async () => (global as any).__db, wipeLocalData: jest.fn(async () => {}) }));
