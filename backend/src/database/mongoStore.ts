import mongoose, { Schema } from 'mongoose';
import type { Store, UserRecord, GoogleProfile, AiKind } from './store';
import { SYNC_COLLECTIONS, SYNC_ENTITIES, type SyncChange, type SyncEntity } from '@gym/shared';
import { SyncEngine, type DocRepo, type SyncDoc } from '../modules/sync/engine';

const userSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, index: true },
    name: { type: String, required: true },
    picture: { type: String, default: null },
    profile: { type: Schema.Types.Mixed, default: {} },
    preferences: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const refreshSchema = new Schema({
  hash: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
});
// TTL: o MongoDB remove automaticamente tokens expirados
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const aiUsageSchema = new Schema({
  userId: { type: String, required: true }, day: { type: String, required: true }, kind: { type: String, required: true }, count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
aiUsageSchema.index({ userId: 1, day: 1, kind: 1 }, { unique: true });
aiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // contadores antigos expiram sozinhos
const AiUsageModel = mongoose.model('AiUsage', aiUsageSchema);

const UserModel = mongoose.model('User', userSchema);
const RefreshModel = mongoose.model('RefreshToken', refreshSchema);

const toRecord = (d: any): UserRecord => ({
  id: String(d._id), googleId: d.googleId, email: d.email, name: d.name, picture: d.picture ?? null,
});

/** Coleções com userId a apagar em deleteUserAndData (coleções de sincronização + contadores + meta). */
export const USER_OWNED_COLLECTIONS = [...SYNC_COLLECTIONS, 'syncMeta', 'aiconversations', 'aiusages'];

const coll = (entity: SyncEntity) => mongoose.connection.db!.collection(SYNC_ENTITIES[entity].collection);
const strip = (d: any): SyncDoc => { const { _id, ...rest } = d; return rest as SyncDoc; };

class MongoDocRepo implements DocRepo {
  async get(userId: string, entity: SyncEntity, entityId: string) { const d = await coll(entity).findOne({ userId, entityId }); return d ? strip(d) : null; }
  async insert(doc: SyncDoc) {
    try { await coll(doc.entity).insertOne({ ...doc }); return true; }
    catch (e: any) { if (e?.code === 11000) return false; throw e; }
  }
  async replace(doc: SyncDoc, expectedVersion: number) {
    const r = await coll(doc.entity).replaceOne({ userId: doc.userId, entityId: doc.entityId, version: expectedVersion }, { ...doc });
    return r.matchedCount === 1;
  }
  async nextSeq(userId: string) {
    const r = await mongoose.connection.db!.collection<{ _id: string; seq: number }>('syncMeta' as any).findOneAndUpdate({ _id: userId } as any, { $inc: { seq: 1 } } as any, { upsert: true, returnDocument: 'after' });
    return (r as any).seq ?? (r as any).value?.seq;
  }
  async listSince(userId: string, cursor: number, limit: number) {
    // uma consulta por coleção (duas entidades podem partilhar a mesma coleção)
    const entityOf = new Map<string, SyncEntity>(); for (const [e, c] of Object.entries(SYNC_ENTITIES)) if (!entityOf.has(c.collection)) entityOf.set(c.collection, e as SyncEntity);
    const all = await Promise.all([...entityOf.values()].map((e) => coll(e).find({ userId, seq: { $gt: cursor } }).sort({ seq: 1 }).limit(limit).toArray()));
    return all.flat().map(strip).sort((a, b) => a.seq - b.seq).slice(0, limit);
  }
}

export async function connectMongo(uri: string) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  await Promise.all([UserModel.init(), RefreshModel.init(), AiUsageModel.init()]);
  for (const e of Object.values(SYNC_ENTITIES)) {
    const c = mongoose.connection.db!.collection(e.collection);
    await c.createIndex({ userId: 1, entityId: 1 }, { unique: true });
    await c.createIndex({ userId: 1, seq: 1 });
  }
}

export class MongoStore implements Store {
  private engine = new SyncEngine(new MongoDocRepo());
  syncPush(userId: string, change: SyncChange) { return this.engine.apply(userId, change); }
  syncPull(userId: string, cursor: number, limit: number) { return this.engine.pull(userId, cursor, limit); }
  async exportUserData(userId: string) {
    const u = await UserModel.findById(userId); const collections: Record<string, unknown[]> = {};
    for (const [entity, cfg] of Object.entries(SYNC_ENTITIES)) {
      const docs = await mongoose.connection.db!.collection(cfg.collection).find({ userId, entity, deleted: false }).toArray();
      collections[entity] = docs.map((d: any) => ({ id: d.entityId, version: d.version, data: d.data }));
    }
    return { exportedAt: new Date().toISOString(), account: u ? { email: u.email, name: u.name } : null, collections };
  }
  async upsertUserByGoogle(p: GoogleProfile) {
    const d = await UserModel.findOneAndUpdate(
      { googleId: p.googleId },
      { $set: { email: p.email, name: p.name, picture: p.picture } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return toRecord(d);
  }
  async findUserById(id: string) {
    if (!mongoose.isValidObjectId(id)) return null;
    const d = await UserModel.findById(id);
    return d ? toRecord(d) : null;
  }
  async deleteUserAndData(id: string) {
    const db = mongoose.connection.db;
    if (db) {
      await Promise.all(USER_OWNED_COLLECTIONS.map((c) => db.collection(c).deleteMany({ userId: id })));
    }
    await RefreshModel.deleteMany({ userId: id });
    await UserModel.deleteOne({ _id: id });
  }
  async saveRefreshToken(t: { hash: string; userId: string; expiresAt: Date }) { await RefreshModel.create(t); }
  async consumeRefreshToken(hash: string) {
    const d = await RefreshModel.findOneAndDelete({ hash });
    if (!d || d.expiresAt.getTime() <= Date.now()) return null;
    return { userId: d.userId };
  }
  async incrementAiUsage(userId: string, day: string, kind: AiKind, limit: number) {
    const d = await AiUsageModel.findOneAndUpdate({ userId, day, kind }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 3 * 86_400_000) } }, { upsert: true, new: true });
    if (d.count > limit) { await AiUsageModel.updateOne({ userId, day, kind }, { $inc: { count: -1 } }); return { allowed: false, used: limit }; }
    return { allowed: true, used: d.count };
  }
  async decrementAiUsage(userId: string, day: string, kind: AiKind) { await AiUsageModel.updateOne({ userId, day, kind, count: { $gt: 0 } }, { $inc: { count: -1 } }); }
  async getAiUsage(userId: string, day: string) {
    const rows = await AiUsageModel.find({ userId, day });
    const n = (k: string) => rows.find((r) => r.kind === k)?.count ?? 0;
    return { chat: n('chat'), meal: n('meal') };
  }
  async revokeRefreshToken(hash: string) { await RefreshModel.deleteOne({ hash }); }
  async revokeAllRefreshTokens(userId: string) { await RefreshModel.deleteMany({ userId }); }
}
