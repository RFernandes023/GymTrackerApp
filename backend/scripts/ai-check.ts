// Testa a chave e o modelo Gemini do .env sem arrancar o servidor (nunca mostra a chave). Uso: npm run ai:check
import { GeminiProvider } from '../src/modules/ai/providers';
import { systemFor } from '../src/modules/ai/prompts';

const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
if (!key) { console.error('Falta GEMINI_API_KEY em backend/.env'); process.exit(1); }
const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
if (!res.ok) { console.error(`A Google recusou a chave (HTTP ${res.status}).`); process.exit(1); }
const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
console.log('Modelos flash disponíveis:', models.filter((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('flash')).map((m) => m.name.replace('models/', '')).join(', '));
try {
  const t = Date.now();
  const r = await new GeminiProvider({ apiKey: key, model, timeoutMs: 90_000 }).generateJson({ system: systemFor('chat'), messages: [{ role: 'user', content: 'Quantas séries de peito por semana?' }], maxOutputTokens: 2500 });
  console.log(`OK (${model}, ${Date.now() - t} ms):`, r.text.slice(0, 300));
} catch (e) { console.error(`Falhou com ${model}:`, (e as Error).message, '- escolhe outro modelo da lista em GEMINI_MODEL.'); process.exit(1); }
