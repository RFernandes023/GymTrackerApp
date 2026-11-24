import { z } from 'zod';

/** Política de conflitos por entidade (secção 2.3 do brief):
 *  - versioned: planos — deteta versões concorrentes e pede resolução ao utilizador;
 *  - immutable: histórico de treinos — a 1.ª escrita ganha, nunca é reescrito;
 *  - lww: restantes — última escrita (por relógio do cliente) ganha. */
export const SYNC_ENTITIES = {
  workout_plan: { collection: 'workoutPlans', policy: 'versioned', maxBytes: 400_000 },
  workout_session: { collection: 'workoutSessions', policy: 'immutable', maxBytes: 300_000 },
  nutrition_entry: { collection: 'nutritionEntries', policy: 'lww', maxBytes: 20_000 },
  food: { collection: 'foods', policy: 'lww', maxBytes: 20_000 },
  recipe: { collection: 'recipes', policy: 'lww', maxBytes: 100_000 },
  body_measurement: { collection: 'bodyMeasurements', policy: 'lww', maxBytes: 20_000 },
  nutrition_goal: { collection: 'nutritionGoals', policy: 'lww', maxBytes: 5_000 },
  custom_exercise: { collection: 'customExercises', policy: 'lww', maxBytes: 50_000 },
  dashboard_layout: { collection: 'userSettings', policy: 'lww', maxBytes: 20_000 },
  /** Perfil corporal, nível e refeições personalizadas (para um dispositivo novo as receber). */
  user_profile: { collection: 'userSettings', policy: 'lww', maxBytes: 10_000 },
} as const;
export type SyncEntity = keyof typeof SYNC_ENTITIES;
export const SYNC_ENTITY_KEYS = Object.keys(SYNC_ENTITIES) as [SyncEntity, ...SyncEntity[]];
export const SYNC_COLLECTIONS: string[] = [...new Set(Object.values(SYNC_ENTITIES).map((e) => e.collection))];

export const syncChange = z.object({
  /** Identificador único da operação (idempotência: reenviar a mesma operação não duplica). */
  opId: z.string().min(8).max(64),
  entity: z.enum(SYNC_ENTITY_KEYS),
  entityId: z.string().min(1).max(120),
  op: z.enum(['upsert', 'delete']),
  payload: z.unknown().optional(),
  /** Versão do servidor que o cliente viu pela última vez (0 = nova). Só conta nas entidades versioned. */
  baseVersion: z.number().int().min(0).default(0),
  clientUpdatedAt: z.number().int().min(0),
}).strict();
export type SyncChange = z.infer<typeof syncChange>;

export const syncPushBody = z.object({ changes: z.array(syncChange).min(1).max(50) }).strict();
export const syncPullQuery = z.object({ cursor: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(200).default(100) });

export interface ServerDoc { data: unknown; version: number; deleted: boolean }
export type PushStatus = 'applied' | 'superseded' | 'conflict' | 'rejected';
export interface PushResult { opId: string; entity: SyncEntity; entityId: string; status: PushStatus; version?: number; serverDoc?: ServerDoc; reason?: string }
export interface PulledChange { entity: SyncEntity; entityId: string; data: unknown; version: number; deleted: boolean; seq: number }
export interface PullResponse { changes: PulledChange[]; nextCursor: number; hasMore: boolean }
