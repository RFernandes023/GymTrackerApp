import type { PlanProposal } from '@gym/shared';
import { getDb } from '../../database/db';
import { uuid } from '../../utils/uuid';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected';
export interface AiMessage { id: string; role: 'user' | 'assistant'; content: string; proposal: PlanProposal | null; proposalStatus: ProposalStatus | null; createdAt: number }

const toMsg = (r: any): AiMessage => ({ id: r.id, role: r.role, content: r.content, proposal: r.proposal_json ? JSON.parse(r.proposal_json) : null, proposalStatus: r.proposal_status, createdAt: r.created_at });

export async function addMessage(userId: string, m: { role: 'user' | 'assistant'; content: string; proposal?: PlanProposal | null }): Promise<AiMessage> {
  const db = await getDb(); const id = uuid();
  await db.runAsync('INSERT INTO ai_messages (id, user_id, role, content, proposal_json, proposal_status, created_at) VALUES (?,?,?,?,?,?,?)',
    id, userId, m.role, m.content, m.proposal ? JSON.stringify(m.proposal) : null, m.proposal ? 'pending' : null, Date.now());
  return toMsg(await db.getFirstAsync('SELECT * FROM ai_messages WHERE id = ?', id));
}
export async function listMessages(userId: string, limit = 60): Promise<AiMessage[]> {
  const db = await getDb();
  return (await db.getAllAsync('SELECT * FROM (SELECT *, rowid AS rid FROM ai_messages WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at, rid', userId, limit)).map(toMsg);
}
export async function setProposalStatus(userId: string, id: string, status: ProposalStatus) {
  const db = await getDb();
  await db.runAsync("UPDATE ai_messages SET proposal_status = ? WHERE id = ? AND user_id = ? AND proposal_json IS NOT NULL", status, id, userId);
}
/** Apaga todo o histórico de conversas (fica só no dispositivo). */
export async function clearHistory(userId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM ai_messages WHERE user_id = ?', userId);
}
