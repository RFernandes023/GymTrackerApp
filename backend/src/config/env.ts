import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  GOOGLE_CLIENT_IDS: z.string().min(1).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  CORS_ORIGINS: z.string().default('').transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  // IA (opcional: por defeito desligada → /ai/* responde 503 e a app usa só análises locais)
  AI_PROVIDER: z.enum(['none', 'gemini', 'openai']).default('none'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  /** Modelo para fotografias (opcional; por defeito o mesmo do chat). */
  OPENAI_VISION_MODEL: z.string().optional(),
  /** Modelos locais (Ollama) podem demorar mais do que os da cloud. */
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(40_000),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).default(40),
  AI_MEAL_PHOTO_DAILY_LIMIT: z.coerce.number().int().min(1).default(10),
  AI_COST_NOTE: z.string().default('Sem custo enquanto estiveres dentro dos limites gratuitos do fornecedor; acima disso o fornecedor pode cobrar.'),
}).superRefine((v, ctx) => {
  if (v.AI_PROVIDER === 'gemini' && !v.GEMINI_API_KEY) ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'obrigatória com AI_PROVIDER=gemini' });
  if (v.AI_PROVIDER === 'openai' && !v.OPENAI_API_KEY) ctx.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'obrigatória com AI_PROVIDER=openai' });
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida (ver backend/.env.example):\n${issues}`);
  }
  return parsed.data;
}
