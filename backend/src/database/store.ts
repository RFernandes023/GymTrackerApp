/** Contrato de persistência usado pelos módulos. Implementações: Mongo (produção) e memória (testes). */
import type { PullResponse, PushResult, SyncChange } from '@gym/shared';

export interface UserRecord {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}
export interface GoogleProfile { googleId: string; email: string; name: string; picture: string | null }

export interface Store {
  upsertUserByGoogle(profile: GoogleProfile): Promise<UserRecord>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Apaga o utilizador e TODOS os dados associados (RGPD). */
  deleteUserAndData(id: string): Promise<void>;
  saveRefreshToken(t: { hash: string; userId: string; expiresAt: Date }): Promise<void>;
  /** Consome (apaga) o token e devolve o dono se existir e não tiver expirado. Atómico. */
  consumeRefreshToken(hash: string): Promise<{ userId: string } | null>;
  revokeRefreshToken(hash: string): Promise<void>;
  revokeAllRefreshTokens(userId: string): Promise<void>;

  /** Contador diário de pedidos à IA por utilizador. Atómico: só permite se não exceder `limit`. */
  incrementAiUsage(userId: string, day: string, kind: AiKind, limit: number): Promise<{ allowed: boolean; used: number }>;
  decrementAiUsage(userId: string, day: string, kind: AiKind): Promise<void>;
  getAiUsage(userId: string, day: string): Promise<{ chat: number; meal: number }>;
  /** Sincronização: aplica uma alteração segundo a política de conflitos da entidade. */
  syncPush(userId: string, change: SyncChange): Promise<PushResult>;
  syncPull(userId: string, cursor: number, limit: number): Promise<PullResponse>;
  /** Exportação completa dos dados do utilizador (RGPD / backup). */
  exportUserData(userId: string): Promise<Record<string, unknown>>;
}
export type AiKind = 'chat' | 'meal';
