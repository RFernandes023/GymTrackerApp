import { SYNC_ENTITIES, type PullResponse, type PulledChange, type PushResult, type SyncChange, type SyncEntity } from '@gym/shared';

export interface SyncDoc {
  userId: string; entity: SyncEntity; entityId: string; data: unknown; version: number; seq: number; deleted: boolean;
  clientUpdatedAt: number; lastOpId: string; updatedAt: number;
}

/** Persistência mínima do motor (Mongo em produção, memória nos testes). */
export interface DocRepo {
  get(userId: string, entity: SyncEntity, entityId: string): Promise<SyncDoc | null>;
  /** false se já existe (corrida entre dois dispositivos). */
  insert(doc: SyncDoc): Promise<boolean>;
  /** Substitui só se a versão guardada ainda for `expectedVersion` (concorrência otimista). */
  replace(doc: SyncDoc, expectedVersion: number): Promise<boolean>;
  nextSeq(userId: string): Promise<number>;
  /** Documentos com seq > cursor (de todas as entidades), por seq crescente. */
  listSince(userId: string, cursor: number, limit: number): Promise<SyncDoc[]>;
}

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v ?? null));
const asServerDoc = (d: SyncDoc) => ({ data: d.data, version: d.version, deleted: d.deleted });

export class SyncEngine {
  constructor(private repo: DocRepo) {}

  async apply(userId: string, c: SyncChange, attempt = 0): Promise<PushResult> {
    const base = { opId: c.opId, entity: c.entity, entityId: c.entityId };
    const policy = SYNC_ENTITIES[c.entity];
    if (c.op === 'upsert') {
      if (c.payload === undefined || c.payload === null) return { ...base, status: 'rejected', reason: 'payload_required' };
      if (bytes(c.payload) > policy.maxBytes) return { ...base, status: 'rejected', reason: 'too_large' };
    }
    const cur = await this.repo.get(userId, c.entity, c.entityId);
    if (cur && cur.lastOpId === c.opId) return { ...base, status: 'applied', version: cur.version }; // reenvio da mesma operação

    const write = async (version: number): Promise<PushResult> => {
      const doc: SyncDoc = { userId, entity: c.entity, entityId: c.entityId, data: c.op === 'delete' ? null : c.payload, version, seq: await this.repo.nextSeq(userId),
        deleted: c.op === 'delete', clientUpdatedAt: c.clientUpdatedAt, lastOpId: c.opId, updatedAt: Date.now() };
      const ok = cur ? await this.repo.replace(doc, cur.version) : await this.repo.insert(doc);
      if (ok) return { ...base, status: 'applied', version };
      // alguém escreveu entretanto: repete uma vez com o estado novo
      return attempt < 1 ? this.apply(userId, c, attempt + 1) : { ...base, status: 'rejected', reason: 'busy' };
    };

    if (!cur) return c.op === 'delete' ? { ...base, status: 'applied', version: 0 } : write(1); // apagar algo que o servidor nunca viu: nada a fazer

    if (policy.policy === 'immutable') {
      if (c.op === 'upsert') return { ...base, status: 'applied', version: cur.version }; // 1.ª escrita ganha; nunca se reescreve histórico
      return cur.deleted ? { ...base, status: 'applied', version: cur.version } : write(cur.version + 1);
    }
    if (policy.policy === 'versioned') {
      if (cur.version === c.baseVersion) return write(cur.version + 1);
      return { ...base, status: 'conflict', version: cur.version, serverDoc: asServerDoc(cur) };
    }
    // lww
    if (c.clientUpdatedAt >= cur.clientUpdatedAt) return write(cur.version + 1);
    return { ...base, status: 'superseded', version: cur.version, serverDoc: asServerDoc(cur) };
  }

  async pull(userId: string, cursor: number, limit: number): Promise<PullResponse> {
    const docs = await this.repo.listSince(userId, cursor, limit + 1);
    const page = docs.slice(0, limit);
    const changes: PulledChange[] = page.map((d) => ({ entity: d.entity, entityId: d.entityId, data: d.data, version: d.version, deleted: d.deleted, seq: d.seq }));
    return { changes, nextCursor: page.at(-1)?.seq ?? cursor, hasMore: docs.length > limit };
  }
}
