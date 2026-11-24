/** Fornecedores de IA intercambiáveis. A app nunca fala com eles diretamente: só o backend, com a chave em variáveis de ambiente. */
export interface ProviderRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  image?: { mimeType: string; base64: string };
  maxOutputTokens: number;
}
export interface ProviderResponse { text: string; usage?: { inputTokens?: number; outputTokens?: number } }
export interface AiProvider { readonly name: string; generateJson(req: ProviderRequest): Promise<ProviderResponse> }

export class ProviderError extends Error {
  constructor(public kind: 'rate_limited' | 'provider_error' | 'timeout' | 'bad_response', message: string, public status?: number) { super(message); }
}

const DEFAULT_TIMEOUT_MS = 40_000;
async function post(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    if (res.status === 429) throw new ProviderError('rate_limited', 'Fornecedor: limite atingido', 429);
    if (!res.ok) throw new ProviderError('provider_error', `Fornecedor respondeu ${res.status}`, res.status); // corpo não é propagado (pode conter dados)
    return await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if ((e as Error)?.name === 'AbortError') throw new ProviderError('timeout', 'Fornecedor não respondeu a tempo');
    throw new ProviderError('provider_error', 'Falha de rede para o fornecedor');
  } finally { clearTimeout(t); }
}

const GEMINI_MIN_OUTPUT = 8192;

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  constructor(private o: { apiKey: string; model: string; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch }) {}
  async generateJson(req: ProviderRequest): Promise<ProviderResponse> {
    const contents = req.messages.map((m, i) => {
      const parts: any[] = [{ text: m.content }];
      if (req.image && i === req.messages.length - 1 && m.role === 'user') parts.push({ inlineData: { mimeType: req.image.mimeType, data: req.image.base64 } });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
    const json = await post(this.o.fetchImpl ?? fetch, `${this.o.baseUrl ?? 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(this.o.model)}:generateContent`,
      { 'x-goog-api-key': this.o.apiKey },
      // os modelos Gemini recentes gastam parte do limite a "pensar": com pouca folga a resposta sai cortada ou vazia
      { systemInstruction: { parts: [{ text: req.system }] }, contents, generationConfig: { responseMimeType: 'application/json', maxOutputTokens: Math.max(req.maxOutputTokens, GEMINI_MIN_OUTPUT), temperature: 0.4 } }, this.o.timeoutMs);
    const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
    if (!text) throw new ProviderError('bad_response', 'Resposta vazia (possivelmente bloqueada por filtros de segurança)');
    return { text, usage: { inputTokens: json?.usageMetadata?.promptTokenCount, outputTokens: json?.usageMetadata?.candidatesTokenCount } };
  }
}

/** Qualquer API compatível com /chat/completions (OpenAI, Azure, servidores locais…). */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai';
  constructor(private o: { apiKey: string; model: string; visionModel?: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }) {}
  async generateJson(req: ProviderRequest): Promise<ProviderResponse> {
    const messages: any[] = [{ role: 'system', content: req.system }, ...req.messages.map((m, i) => {
      if (req.image && i === req.messages.length - 1 && m.role === 'user') return { role: 'user', content: [{ type: 'text', text: m.content }, { type: 'image_url', image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` } }] };
      return m;
    })];
    const json = await post(this.o.fetchImpl ?? fetch, `${this.o.baseUrl.replace(/\/$/, '')}/chat/completions`, { Authorization: `Bearer ${this.o.apiKey}` },
      { model: (req.image && this.o.visionModel) || this.o.model, messages, response_format: { type: 'json_object' }, max_tokens: req.maxOutputTokens, temperature: 0.4 }, this.o.timeoutMs);
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text) throw new ProviderError('bad_response', 'Resposta vazia');
    return { text, usage: { inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens } };
  }
}
