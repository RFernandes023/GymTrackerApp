import type { PullResponse, PushResult, SyncChange } from '@gym/shared';
import { apiFetch } from './api';
import type { SyncApi } from '../features/sync/engine';

export const remoteSyncApi: SyncApi = {
  push: (changes: SyncChange[]) => apiFetch<{ results: PushResult[] }>('/sync/push', { method: 'POST', body: JSON.stringify({ changes }) }),
  pull: (cursor: number, limit: number) => apiFetch<PullResponse>(`/sync/pull?cursor=${cursor}&limit=${limit}`),
};
