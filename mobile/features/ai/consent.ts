import type { AiScope } from '@gym/shared';
import { kvDelete, kvGet, kvSet } from '../../database/kv';

export interface Consent { version: 1; acceptedAt: number; scopes: Record<AiScope, boolean> }
const key = (u: string) => `ai.consent.${u}`;

export const CONSENT_POINTS = [
  'Quando fizeres um pedido, os dados que escolheres (treino, nutrição e/ou corpo) são enviados ao servidor da app e daí a um serviço de IA externo (por defeito, Google Gemini).',
  'Enviamos só o necessário para esse pedido, sem nome, email nem identificadores. Podes ver exatamente o que vai antes de enviar.',
  'No escalão gratuito do Gemini, a Google pode usar o conteúdo enviado para melhorar os seus produtos. Se não aceitas isso, não uses o Treinador IA.',
  'As respostas são sugestões automáticas, não aconselhamento médico, e podem conter erros. A IA nunca altera os teus planos: só propõe e tu aprovas.',
  'As conversas ficam apenas no teu dispositivo e podes apagá-las quando quiseres. Fotografias de refeições pedem sempre a tua autorização antes de serem enviadas.',
];

export async function getConsent(userId: string): Promise<Consent | null> { const v = await kvGet(key(userId)); return v ? (JSON.parse(v) as Consent) : null; }
export async function acceptConsent(userId: string, scopes: Record<AiScope, boolean> = { training: true, nutrition: true, body: true }): Promise<Consent> {
  const c: Consent = { version: 1, acceptedAt: Date.now(), scopes }; await kvSet(key(userId), JSON.stringify(c)); return c;
}
export async function setScopes(userId: string, scopes: Record<AiScope, boolean>) {
  const c = await getConsent(userId); if (c) await kvSet(key(userId), JSON.stringify({ ...c, scopes }));
}
export async function revokeConsent(userId: string) { await kvDelete(key(userId)); }
