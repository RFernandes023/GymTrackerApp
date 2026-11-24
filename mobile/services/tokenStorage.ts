import * as SecureStore from 'expo-secure-store';

const K = { access: 'auth.access', refresh: 'auth.refresh' } as const;

export interface Tokens { accessToken: string; refreshToken: string }

export async function saveTokens(t: Tokens) {
  await SecureStore.setItemAsync(K.access, t.accessToken);
  await SecureStore.setItemAsync(K.refresh, t.refreshToken);
}
export async function loadTokens(): Promise<Tokens | null> {
  const [accessToken, refreshToken] = await Promise.all([SecureStore.getItemAsync(K.access), SecureStore.getItemAsync(K.refresh)]);
  return refreshToken ? { accessToken: accessToken ?? '', refreshToken } : null;
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync(K.access);
  await SecureStore.deleteItemAsync(K.refresh);
}
