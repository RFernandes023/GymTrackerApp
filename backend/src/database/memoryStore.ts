import { randomUUID } from 'node:crypto';
import type { Store, UserRecord, GoogleProfile, AiKind } from './store';
import type { SyncChange, SyncEntity } from '@gym/shared';
import { SyncEngine, type DocRepo, type SyncDoc } from '../modules/sync/engine';

class MemoryDocRepo implements DocRepo {
  docs = new Map<string, SyncDoc>(); seqs = new Map<string, number>();
  private k = (u: string, e: SyncEntity, id: string) => `${u}|${e}|${id}`;
  async get(u: string, e: SyncEntity, id: string) { const d = this.docs.get(this.k(u, e, id)); return d ? { ...d } : null; }
  async insert(d: SyncDoc) { const k = this.k(d.userId, d.entity, d.entityId); if (this.docs.has(k)) return false; this.docs.set(k, { ...d }); return true; }
  async replace(d: SyncDoc, expected: number) { const k = this.k(d.userId, d.entity, d.entityId); if (this.docs.get(k)?.version !== expected) return false; this.docs.set(k, { ...d }); return true; }
  async nextSeq(u: string) { const n = (this.seqs.get(u) ?? 0) + 1; this.seqs.set(u, n); return n; }
  async listSince(u: string, cursor: number, limit: number) { return [...this.docs.values()].filter((d) => d.userId === u && d.seq > cursor).sort((a, b) => a.seq - b.seq).slice(0, limit).map((d) => ({ ...d })); }
}

export class MemoryStore implements Store {
  syncRepo = new MemoryDocRepo();
  private engine = new SyncEngine(this.syncRepo);
  syncPush(userId: string, change: SyncChange) { return this.engine.apply(userId, change); }
  syncPull(userId: string, cursor: number, limit: number) { return this.engine.pull(userId, cursor, limit); }
  async exportUserData(userId: string) {
    const u = this.users.get(userId); const collections: Record<string, unknown[]> = {};
    for (const d of this.syncRepo.docs.values()) if (d.userId === userId && !d.deleted) (collections[d.entity] ??= []).push({ id: d.entityId, version: d.version, data: d.data });
    return { exportedAt: new Date().toISOString(), account: u ? { email: u.email, name: u.name } : null, collections };
  }
  users = new Map<string, UserRecord>();
  tokens = new Map<string, { userId: string; expiresAt: Date }>();

  async upsertUserByGoogle(p: GoogleProfile) {
    const existing = [...this.users.values()].find((u) => u.googleId === p.googleId);
    if (existing) { Object.assign(existing, { email: p.email, name: p.name, picture: p.picture }); return existing; }
    const u: UserRecord = { id: randomUUID(), ...p };
    this.users.set(u.id, u);
    return u;
  }
  async findUserById(id: string) { return this.users.get(id) ?? null; }
  async deleteUserAndData(id: string) { this.users.delete(id); for (const k of [...this.syncRepo.docs.keys()]) if (k.startsWith(`${id}|`)) this.syncRepo.docs.delete(k); this.syncRepo.seqs.delete(id); await this.revokeAllRefreshTokens(id); for (const k of [...this.aiUsage.keys()]) if (k.startsWith(`${id}|`)) this.aiUsage.delete(k); }
  async saveRefreshToken(t: { hash: string; userId: string; expiresAt: Date }) { this.tokens.set(t.hash, t); }
  async consumeRefreshToken(hash: string) {
    const t = this.tokens.get(hash);
    if (!t) return null;
    this.tokens.delete(hash);
    return t.expiresAt.getTime() > Date.now() ? { userId: t.userId } : null;
  }
  aiUsage = new Map<string, number>();
  private k = (u: string, d: string, kind: AiKind) => `${u}|${d}|${kind}`;
  async incrementAiUsage(u: string, d: string, kind: AiKind, limit: number) {
    const cur = this.aiUsage.get(this.k(u, d, kind)) ?? 0;
    if (cur >= limit) return { allowed: false, used: cur };
    this.aiUsage.set(this.k(u, d, kind), cur + 1);
    return { allowed: true, used: cur + 1 };
  }
  async decrementAiUsage(u: string, d: string, kind: AiKind) { const c = this.aiUsage.get(this.k(u, d, kind)) ?? 0; this.aiUsage.set(this.k(u, d, kind), Math.max(0, c - 1)); }
  async getAiUsage(u: string, d: string) { return { chat: this.aiUsage.get(this.k(u, d, 'chat')) ?? 0, meal: this.aiUsage.get(this.k(u, d, 'meal')) ?? 0 }; }
  async revokeRefreshToken(hash: string) { this.tokens.delete(hash); }
  async revokeAllRefreshTokens(userId: string) {
    for (const [h, t] of this.tokens) if (t.userId === userId) this.tokens.delete(h);
  }
}
