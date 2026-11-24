import { planProposal, type AiChatBody, type MealItem, type PlanProposal } from '@gym/shared';
import { ApiError, NetworkError, apiFetch } from './api';

export interface AiStatus {
  enabled: boolean; provider: string | null; model: string | null;
  chat: { used: number; limit: number }; meal: { used: number; limit: number }; costNote: string;
}
export interface ChatResult { reply: string; proposal: unknown; proposalDropped?: boolean; usage: { used: number; limit: number; inputTokens: number | null; outputTokens: number | null } }

export const aiStatus = () => apiFetch<AiStatus>('/ai/status');

export async function aiChat(body: AiChatBody): Promise<{ reply: string; proposal: PlanProposal | null; usage: ChatResult['usage'] }> {
  const r = await apiFetch<ChatResult>('/ai/chat', { method: 'POST', body: JSON.stringify(body) });
  // validação também no cliente: nunca confiar numa proposta sem a validar
  const p = r.proposal ? planProposal.safeParse(r.proposal) : null;
  return { reply: r.reply, proposal: p?.success ? p.data : null, usage: r.usage };
}

export const aiMealPhoto = (imageBase64: string, mimeType: 'image/jpeg', note?: string) =>
  apiFetch<{ items: MealItem[]; estimate: true; usage: { used: number; limit: number } }>('/ai/meal-photo', { method: 'POST', body: JSON.stringify({ imageBase64, mimeType, note }) });

/** Mensagem amigável para qualquer falha da IA (a app continua a funcionar sem ela). */
export function describeAiError(e: unknown): string {
  if (e instanceof NetworkError) return 'Sem ligação à internet. O treinador IA precisa de ligação; o resto da app continua a funcionar.';
  if (e instanceof ApiError) {
    if (e.code === 'ai_unavailable') return 'O treinador IA não está configurado neste servidor.';
    if (e.code === 'daily_limit') return 'Atingiste o limite diário de pedidos. Volta amanhã.';
    if (e.code === 'provider_rate_limited') return 'O serviço de IA está sobrecarregado. Tenta daqui a pouco.';
    if (e.code === 'provider_error') return 'O serviço de IA falhou. Tenta novamente.';
    if (e.code === 'context_too_large') return 'Os dados a enviar são demasiados. Desliga um âmbito (treino, nutrição ou corpo).';
    if (e.status === 401) return 'Sessão expirada. Volta a iniciar sessão.';
  }
  return 'Não foi possível contactar o treinador IA.';
}
