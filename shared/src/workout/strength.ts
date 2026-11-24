export type TrainingGoal = 'hypertrophy' | 'strength' | 'endurance';
export type TrainingLevel = 'novice' | 'intermediate' | 'advanced';

export const GOAL_LABELS: Record<TrainingGoal, string> = { hypertrophy: 'Hipertrofia', strength: 'Força', endurance: 'Resistência' };
export const LEVEL_LABELS: Record<TrainingLevel, string> = { novice: 'Iniciante', intermediate: 'Intermédio', advanced: 'Avançado' };

/** Parâmetros típicos por objetivo. `pctRM` = fração do 1RM usada nas séries de trabalho. */
export const GOAL_DEFAULTS: Record<TrainingGoal, { repMin: number; repMax: number; restSeconds: number; sets: number; pctRM: number }> = {
  hypertrophy: { repMin: 8, repMax: 12, restSeconds: 90, sets: 3, pctRM: 0.7 },
  strength: { repMin: 3, repMax: 6, restSeconds: 180, sets: 4, pctRM: 0.85 },
  endurance: { repMin: 15, repMax: 20, restSeconds: 60, sets: 3, pctRM: 0.55 },
};

export interface ExerciseInfo { nameEn: string; equipment: string; type: string | null; primary: string[] }
export interface BodyInfo { sex: 'male' | 'female'; age: number; heightCm: number; weightKg: number; level?: TrainingLevel }

export interface StartingWeight { weight: number; perHand: boolean; basis: 'name' | 'generic'; note: string }

/** Ordem importa (específico → genérico). `r` = 1RM de um iniciante ÷ peso corporal (homem); `hand` = valor por haltere. */
const BY_NAME: { re: RegExp; r: number; hand?: boolean }[] = [
  { re: /incline.*(dumbbell|db)|dumbbell.*incline/i, r: 0.24, hand: true },
  { re: /(dumbbell|db).*(bench|press)(?!.*shoulder)|bench.*dumbbell/i, r: 0.28, hand: true },
  { re: /incline.*barbell|barbell.*incline/i, r: 0.55 },
  { re: /close.?grip.*bench/i, r: 0.55 },
  { re: /barbell.*bench|bench press/i, r: 0.65 },
  { re: /(dumbbell|db).*fl(y|ye|ies|yes)|fl(y|ye|ies|yes).*dumbbell/i, r: 0.09, hand: true },
  { re: /butterfly|pec deck|machine.*(fly|chest)|chest.*machine/i, r: 0.4 },
  { re: /cable.*(fly|crossover)|crossover/i, r: 0.15 },
  { re: /front.*squat/i, r: 0.6 },
  { re: /hack/i, r: 1.0 },
  { re: /leg press/i, r: 1.5 },
  { re: /(barbell|smith).*squat|squat/i, r: 0.8 },
  { re: /romanian|stiff|good morning/i, r: 0.75 },
  { re: /deadlift/i, r: 1.0 },
  { re: /hip thrust|glute bridge/i, r: 0.9 },
  { re: /lunge|split squat/i, r: 0.2, hand: true },
  { re: /leg extension/i, r: 0.5 },
  { re: /leg curl/i, r: 0.4 },
  { re: /calf/i, r: 0.8 },
  { re: /(dumbbell|db).*shoulder press|(dumbbell|db).*(arnold|overhead)/i, r: 0.15, hand: true },
  { re: /overhead press|military press|shoulder press|barbell.*press.*(behind|front)?/i, r: 0.4 },
  { re: /lateral raise|side lateral/i, r: 0.07, hand: true },
  { re: /front.*raise/i, r: 0.08, hand: true },
  { re: /reverse fl|rear.*(delt|fly)/i, r: 0.06, hand: true },
  { re: /face pull/i, r: 0.2 },
  { re: /shrug/i, r: 0.8 },
  { re: /(dumbbell|db).*row|one.arm.*row/i, r: 0.25, hand: true },
  { re: /bent.?over.*row|barbell.*row|pendlay/i, r: 0.6 },
  { re: /pulldown|pull-down|lat pull/i, r: 0.6 },
  { re: /seated.*row|cable.*row|machine.*row/i, r: 0.6 },
  { re: /pullover/i, r: 0.2 },
  { re: /(dumbbell|db).*(curl)|hammer curl|concentration|alternate.*curl/i, r: 0.13, hand: true },
  { re: /(barbell|ez|e-z).*curl|preacher|curl/i, r: 0.3 },
  { re: /skull|lying.*triceps|triceps.*extension.*(lying|barbell)/i, r: 0.25 },
  { re: /triceps.*(pushdown|push-down)|pushdown/i, r: 0.3 },
  { re: /(overhead|cable).*triceps|triceps.*(overhead|rope)/i, r: 0.25 },
  { re: /wrist/i, r: 0.2 },
];

const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']);
const LARGE = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes']);

/** Rácio genérico (por equipamento/tipo) para exercícios sem correspondência por nome. null = sem carga externa. */
function genericRatio(e: ExerciseInfo): { r: number; hand: boolean } | null {
  if (e.equipment === 'bodyweight' || e.equipment === 'bands') return null;
  const compound = e.type === 'compound', large = e.primary.some((m) => LARGE.has(m));
  if (e.equipment === 'dumbbell') return { r: compound ? (large ? 0.22 : 0.14) : 0.07, hand: true };
  if (e.equipment === 'kettlebell') return { r: 0.2, hand: false };
  if (e.equipment === 'machine') return { r: compound ? (large ? 0.7 : 0.4) : 0.3, hand: false };
  if (e.equipment === 'cable') return { r: compound ? 0.5 : 0.2, hand: false };
  if (e.equipment === 'barbell') return { r: compound ? (large ? 0.6 : 0.35) : 0.25, hand: false };
  return { r: 0.3, hand: false };
}

export const defaultIncrement = (equipment: string) => (equipment === 'dumbbell' ? 2 : equipment === 'machine' ? 5 : equipment === 'kettlebell' ? 4 : 2.5);

const ageFactor = (age: number) => (age <= 40 ? 1 : Math.max(0.7, 1 - ((age - 40) * 0.15) / 20));

/**
 * Carga inicial ESTIMADA para uma pessoa "normal" (sem treino prévio específico) a começar este exercício.
 * Usa rácios de força de iniciante ÷ peso corporal, ajustados por sexo, idade, nível e objetivo, e arredondada ao incremento.
 * É apenas um ponto de partida seguro — nunca substitui o histórico real nem o juízo do utilizador.
 * Devolve null para exercícios sem carga externa (peso corporal/elásticos) ou dados de perfil inválidos.
 */
export function suggestStartingWeight(e: ExerciseInfo, body: BodyInfo, goal: TrainingGoal = 'hypertrophy', increment = defaultIncrement(e.equipment)): StartingWeight | null {
  if (!(body.weightKg > 30 && body.weightKg < 300 && body.heightCm > 100 && body.heightCm < 250 && body.age >= 14 && body.age <= 100)) return null;
  if (e.equipment === 'bodyweight' || e.equipment === 'bands') return null;
  const named = BY_NAME.find((x) => x.re.test(e.nameEn));
  const gen = genericRatio(e);
  const m = named ? { r: named.r, hand: !!named.hand, basis: 'name' as const } : gen ? { ...gen, basis: 'generic' as const } : null;
  if (!m) return null;
  // peso corporal efetivo: limita a IMC 30 (excesso de massa gorda não aumenta a força proporcionalmente)
  const effBW = Math.min(body.weightKg, 30 * (body.heightCm / 100) ** 2);
  const lower = e.primary.some((p) => LOWER.has(p));
  const sexF = body.sex === 'female' ? (lower ? 0.7 : 0.55) : 1;
  const levelF = { novice: 1, intermediate: 1.35, advanced: 1.75 }[body.level ?? 'novice'];
  const FIRST_TIME = 0.9; // margem de segurança numa 1.ª vez
  const raw = m.r * effBW * sexF * ageFactor(body.age) * levelF * GOAL_DEFAULTS[goal].pctRM * FIRST_TIME;
  const step = increment > 0 ? increment : 2.5;
  let w = Math.round(raw / step) * step;
  let note = 'Estimativa para uma pessoa normal com o teu peso, idade e objetivo. Ajusta conforme a sensação.';
  if (e.equipment === 'barbell') {
    const bar = e.type === 'compound' && e.primary.some((p) => LARGE.has(p)) ? 20 : 10;
    if (w < bar) { w = bar; note = 'Começa só com a barra e ajusta. ' + note; }
  }
  w = Math.max(step, Math.round(w * 100) / 100);
  return { weight: w, perHand: m.hand, basis: m.basis, note };
}
