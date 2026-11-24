import { buildApp } from './app';
import { loadEnv } from './config/env';
import { MongoStore, connectMongo } from './database/mongoStore';
import { createGoogleVerifier } from './integrations/googleVerifier';
import { AiService } from './modules/ai/service';
import { GeminiProvider, OpenAiCompatibleProvider, type AiProvider } from './modules/ai/providers';

const env = loadEnv();
await connectMongo(env.MONGODB_URI);
const store = new MongoStore();
const provider: AiProvider | null = env.AI_PROVIDER === 'gemini' ? new GeminiProvider({ apiKey: env.GEMINI_API_KEY!, model: env.GEMINI_MODEL, timeoutMs: env.AI_TIMEOUT_MS })
  : env.AI_PROVIDER === 'openai' ? new OpenAiCompatibleProvider({ apiKey: env.OPENAI_API_KEY!, model: env.OPENAI_MODEL, visionModel: env.OPENAI_VISION_MODEL, baseUrl: env.OPENAI_BASE_URL, timeoutMs: env.AI_TIMEOUT_MS }) : null;
const app = await buildApp({
  store,
  ai: new AiService({ provider, dailyLimit: env.AI_DAILY_LIMIT, mealLimit: env.AI_MEAL_PHOTO_DAILY_LIMIT, costNote: env.AI_COST_NOTE, model: env.AI_PROVIDER === 'gemini' ? env.GEMINI_MODEL : env.AI_PROVIDER === 'openai' ? env.OPENAI_MODEL : undefined }, store),
  google: createGoogleVerifier(env.GOOGLE_CLIENT_IDS),
  jwtSecret: env.JWT_SECRET,
  corsOrigins: env.CORS_ORIGINS,
  logger: true,
  trustProxy: env.NODE_ENV === 'production',
});
// Em produção, colocar atrás de um proxy/PaaS com HTTPS (TLS termina no proxy).
if (env.NODE_ENV === 'production') app.log.info('Garantir que o tráfego público é apenas HTTPS');
await app.listen({ port: env.PORT, host: env.HOST });
