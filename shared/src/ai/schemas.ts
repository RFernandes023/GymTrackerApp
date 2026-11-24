import { z } from 'zod';

export const MUSCLE_KEYS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] as const;
export const EQUIPMENT_KEYS = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'bands', 'other'] as const;
export const AI_SCOPES = ['training', 'nutrition', 'body'] as const;
export type AiScope = (typeof AI_SCOPES)[number];
export const AI_TASKS = ['chat', 'analyze_progress', 'weekly_volume', 'create_plan', 'alternatives', 'nutrition_review'] as const;
export type AiTask = (typeof AI_TASKS)[number];

/** O cliente só pode enviar mensagens de utilizador/assistente; o prompt de sistema é SEMPRE do servidor. */
export const chatMessage = z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }).strict();

export const aiChatBody = z.object({
  task: z.enum(AI_TASKS).default('chat'),
  messages: z.array(chatMessage).min(1).max(12),
  context: z.object({ scopes: z.array(z.enum(AI_SCOPES)).max(3), data: z.record(z.string(), z.unknown()) }).strict().optional(),
}).strict();
export type AiChatBody = z.infer<typeof aiChatBody>;
export const MAX_CONTEXT_BYTES = 24_000;

export const proposedExercise = z.object({
  name: z.string().trim().min(2).max(80),
  muscle: z.enum(MUSCLE_KEYS).optional(),
  equipment: z.enum(EQUIPMENT_KEYS).optional(),
  sets: z.number().int().min(1).max(10),
  repMin: z.number().int().min(1).max(50),
  repMax: z.number().int().min(1).max(100),
  weight: z.number().min(0).max(500).nullable().optional(),
  restSeconds: z.number().int().min(0).max(600).nullable().optional(),
  notes: z.string().max(200).optional(),
  supersetWithPrevious: z.boolean().optional(),
}).refine((e) => e.repMax >= e.repMin, { message: 'repMax < repMin' });

export const proposedDay = z.object({
  name: z.string().trim().min(1).max(40),
  dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
  exercises: z.array(proposedExercise).min(1).max(12),
});

export const planProposal = z.object({
  planName: z.string().trim().min(1).max(60),
  goal: z.enum(['hypertrophy', 'strength', 'endurance']).default('hypertrophy'),
  rationale: z.string().max(800).default(''),
  /** Se presente, a proposta altera esse plano; caso contrário cria um novo. */
  targetPlanId: z.string().max(64).nullable().optional(),
  days: z.array(proposedDay).min(1).max(7),
});
export type PlanProposal = z.infer<typeof planProposal>;
export type ProposedExercise = z.infer<typeof proposedExercise>;

export const aiReply = z.object({ reply: z.string().max(8000), proposal: planProposal.nullable().optional() });
export type AiReply = z.infer<typeof aiReply>;

export const mealPhotoBody = z.object({
  imageBase64: z.string().min(100).max(2_000_000).regex(/^[A-Za-z0-9+/=\s]+$/, 'base64 inválido'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  note: z.string().trim().max(200).optional(),
}).strict();

export const mealItem = z.object({
  name: z.string().trim().min(1).max(80),
  grams: z.number().positive().max(2000),
  kcal: z.number().min(0).max(5000), protein: z.number().min(0).max(500), carbs: z.number().min(0).max(800), fat: z.number().min(0).max(500),
});
export type MealItem = z.infer<typeof mealItem>;
export const mealPhotoReply = z.object({ items: z.array(mealItem).max(15) });
