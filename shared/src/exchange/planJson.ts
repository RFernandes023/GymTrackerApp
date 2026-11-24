import type { SetType } from '../workout/logic';
import { EQUIPMENT_KEYS, MUSCLE_KEYS } from '../ai/schemas';

export const PLAN_SCHEMA_VERSION = '1.0';
export type PlanGoal = 'hypertrophy' | 'strength' | 'endurance';

export interface ImportSet { type: SetType; repMin: number; repMax: number; weight: number; restSeconds: number | null; rir: number | null }
export interface ImportExercise {
  /** ID da biblioteca da app; se existir, tem prioridade sobre o nome. */
  exerciseId: string | null;
  namePt: string | null; nameEn: string | null; displayName: string; primary: string[]; secondary: string[]; equipment: string | null;
  sets: ImportSet[]; weightIncrement: number | null; goal: PlanGoal | null; notes: string | null; supersetGroup: string | null;
}
export interface ImportDay { name: string; dayOfWeek: number | null; exercises: ImportExercise[] }
export interface ImportPlan { name: string; description: string | null; language: string | null; goal: PlanGoal; defaultRestSeconds: number | null; days: ImportDay[] }

export type ParseResult = { ok: true; plan: ImportPlan; warnings: string[] } | { ok: false; errors: string[] };

const MUSCLE_ALIASES: Record<string, string> = {
  chest: 'chest', pecs: 'chest', pectorals: 'chest', peito: 'chest',
  back: 'back', lats: 'back', traps: 'back', lower_back: 'back', middle_back: 'back', upper_back: 'back', rhomboids: 'back', costas: 'back',
  shoulders: 'shoulders', delts: 'shoulders', front_delts: 'shoulders', side_delts: 'shoulders', rear_delts: 'shoulders', ombros: 'shoulders',
  biceps: 'biceps', triceps: 'triceps', forearms: 'forearms', antebracos: 'forearms',
  abs: 'abs', core: 'abs', abdominals: 'abs', obliques: 'abs', abdominais: 'abs',
  quads: 'quads', quadriceps: 'quads', hamstrings: 'hamstrings', glutes: 'glutes', calves: 'calves', adductors: 'adductors', abductors: 'abductors',
};
const SET_TYPES: Record<string, SetType> = {
  warmup: 'warmup', warm_up: 'warmup', working: 'working', normal: 'working', effective: 'working', drop: 'drop', dropset: 'drop', drop_set: 'drop',
  rest_pause: 'rest_pause', restpause: 'rest_pause', failure: 'failure', to_failure: 'failure', amrap: 'failure',
};
const EQUIP_ALIASES: Record<string, string> = { barbell: 'barbell', dumbbell: 'dumbbell', dumbbells: 'dumbbell', machine: 'machine', cable: 'cable', cables: 'cable', bodyweight: 'bodyweight', body_only: 'bodyweight', kettlebell: 'kettlebell', bands: 'bands', band: 'bands', other: 'other' };
const GOALS: PlanGoal[] = ['hypertrophy', 'strength', 'endurance'];

const key = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/[\s-]+/g, '_');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Valida e normaliza um plano em JSON (formato versionado). Devolve TODOS os erros (com o caminho do campo) para o utilizador corrigir;
 * um JSON inválido nunca produz um plano. Avisos (ex.: músculo desconhecido) não bloqueiam.
 */
export function parsePlanJson(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch (e) { return { ok: false, errors: [`JSON inválido: ${(e as Error).message}`] }; }
  const errors: string[] = [], warnings: string[] = [];
  const err = (path: string, msg: string) => { if (errors.length < 30) errors.push(`${path}: ${msg}`); };

  if (!isObj(raw)) return { ok: false, errors: ['O JSON deve ser um objeto.'] };
  if (raw.type !== 'workout_plan') return { ok: false, errors: [`type: esperado "workout_plan"${typeof raw.type === 'string' ? `, recebido "${raw.type}"` : ''}.`] };
  if (typeof raw.schemaVersion !== 'string' || !/^1(\.\d+)?$/.test(raw.schemaVersion)) return { ok: false, errors: [`schemaVersion: versão não suportada (${String(raw.schemaVersion)}). Esta app lê a versão 1.x.`] };

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 60) err('name', 'obrigatório (1 a 60 caracteres)');
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) || null : null;
  const settings = isObj(raw.settings) ? raw.settings : {};
  let goal: PlanGoal = 'hypertrophy';
  if (settings.goal !== undefined) { if (GOALS.includes(settings.goal as PlanGoal)) goal = settings.goal as PlanGoal; else warnings.push(`settings.goal "${String(settings.goal)}" desconhecido; usado "hypertrophy".`); }
  const defaultRest = isNum(settings.restBetweenExercises) && settings.restBetweenExercises >= 0 && settings.restBetweenExercises <= 1800 ? Math.round(settings.restBetweenExercises) : null;

  const days: ImportDay[] = [];
  if (!Array.isArray(raw.days) || raw.days.length < 1 || raw.days.length > 7) err('days', 'deve ser uma lista com 1 a 7 dias');
  else raw.days.forEach((d: unknown, di: number) => {
    const dp = `days[${di}]`;
    if (!isObj(d)) return err(dp, 'deve ser um objeto');
    const dname = typeof d.name === 'string' ? d.name.trim() : '';
    if (!dname || dname.length > 40) err(`${dp}.name`, 'obrigatório (1 a 40 caracteres)');
    let dow: number | null = null;
    if (d.dayOfWeek !== undefined && d.dayOfWeek !== null) { if (Number.isInteger(d.dayOfWeek) && (d.dayOfWeek as number) >= 1 && (d.dayOfWeek as number) <= 7) dow = d.dayOfWeek as number; else err(`${dp}.dayOfWeek`, 'deve ser 1 (segunda) a 7 (domingo) ou null'); }
    const exercises: ImportExercise[] = [];
    if (!Array.isArray(d.exercises) || d.exercises.length < 1 || d.exercises.length > 15) err(`${dp}.exercises`, 'deve ser uma lista com 1 a 15 exercícios');
    else d.exercises.forEach((e: unknown, ei: number) => {
      const ep = `${dp}.exercises[${ei}]`;
      if (!isObj(e)) return err(ep, 'deve ser um objeto');
      let namePt: string | null = null, nameEn: string | null = null;
      if (typeof e.name === 'string') { namePt = e.name.trim() || null; }
      else if (isObj(e.name)) { namePt = typeof e.name.pt === 'string' ? e.name.pt.trim() || null : null; nameEn = typeof e.name.en === 'string' ? e.name.en.trim() || null : null; }
      const exerciseId = typeof e.exerciseId === 'string' ? e.exerciseId.trim().slice(0, 120) || null : null;
      if (!namePt && !nameEn && !exerciseId) err(`${ep}.name`, 'indica o exerciseId ou o nome (texto ou {"pt": "...", "en": "..."})');
      const mg = isObj(e.muscleGroups) ? e.muscleGroups : {};
      const mapMuscles = (v: unknown, field: string): string[] => {
        if (v === undefined) return [];
        if (!Array.isArray(v)) { err(`${ep}.muscleGroups.${field}`, 'deve ser uma lista'); return []; }
        const out = new Set<string>();
        for (const m of v) { const k = typeof m === 'string' ? MUSCLE_ALIASES[key(m)] : undefined; if (k) out.add(k); else warnings.push(`${ep}: músculo "${String(m)}" desconhecido (ignorado).`); }
        return [...out];
      };
      const primary = mapMuscles(mg.primary, 'primary');
      const secondary = mapMuscles(mg.secondary, 'secondary').filter((m) => !primary.includes(m));
      let equipment: string | null = null;
      if (typeof e.equipment === 'string') { equipment = EQUIP_ALIASES[key(e.equipment)] ?? null; if (!equipment) warnings.push(`${ep}: equipamento "${e.equipment}" desconhecido (usado "other").`), equipment = 'other'; }
      const sets: ImportSet[] = [];
      if (!Array.isArray(e.sets) || e.sets.length < 1 || e.sets.length > 15) err(`${ep}.sets`, 'deve ser uma lista com 1 a 15 séries');
      else e.sets.forEach((s: unknown, si: number) => {
        const sp = `${ep}.sets[${si}]`;
        if (!isObj(s)) return err(sp, 'deve ser um objeto');
        let type: SetType = 'working';
        if (s.type !== undefined) { const t = typeof s.type === 'string' ? SET_TYPES[key(s.type)] : undefined; if (t) type = t; else err(`${sp}.type`, `tipo "${String(s.type)}" inválido (warmup, working, drop, rest_pause, failure)`); }
        let repMin = 0, repMax = 0;
        if (isNum(s.reps) && Number.isInteger(s.reps) && s.reps >= 1 && s.reps <= 100) { repMin = repMax = s.reps; }
        else if (isObj(s.reps) && isNum(s.reps.min) && isNum(s.reps.max) && Number.isInteger(s.reps.min) && Number.isInteger(s.reps.max) && s.reps.min >= 1 && s.reps.max >= s.reps.min && s.reps.max <= 100) { repMin = s.reps.min; repMax = s.reps.max; }
        else err(`${sp}.reps`, 'deve ser um inteiro (1–100) ou {"min": n, "max": n} com max ≥ min');
        let weight = 0;
        if (s.weight !== undefined && s.weight !== null) { if (isNum(s.weight) && s.weight >= 0 && s.weight <= 500) weight = s.weight; else err(`${sp}.weight`, 'deve ser um número entre 0 e 500 (kg)'); }
        let rest: number | null = null;
        if (s.restSeconds !== undefined && s.restSeconds !== null) { if (isNum(s.restSeconds) && Number.isInteger(s.restSeconds) && s.restSeconds >= 0 && s.restSeconds <= 1800) rest = s.restSeconds; else err(`${sp}.restSeconds`, 'deve ser um inteiro entre 0 e 1800'); }
        let rir: number | null = null;
        if (s.rir !== undefined && s.rir !== null) { if (isNum(s.rir) && Number.isInteger(s.rir) && s.rir >= 0 && s.rir <= 5) rir = s.rir; else err(`${sp}.rir`, 'deve ser um inteiro entre 0 e 5 ou null'); }
        sets.push({ type, repMin, repMax, weight, restSeconds: rest, rir });
      });
      let inc: number | null = null;
      if (e.weightIncrement !== undefined && e.weightIncrement !== null) { if (isNum(e.weightIncrement) && e.weightIncrement > 0 && e.weightIncrement <= 50) inc = e.weightIncrement; else err(`${ep}.weightIncrement`, 'deve ser um número maior que 0 (kg)'); }
      let egoal: PlanGoal | null = null;
      if (e.goal !== undefined && e.goal !== null) { if (GOALS.includes(e.goal as PlanGoal)) egoal = e.goal as PlanGoal; else warnings.push(`${ep}.goal "${String(e.goal)}" desconhecido (ignorado).`); }
      const notes = typeof e.notes === 'string' ? e.notes.trim().slice(0, 300) || null : null;
      const supersetGroup = typeof e.supersetGroup === 'string' && e.supersetGroup.trim() ? e.supersetGroup.trim().slice(0, 40) : null;
      exercises.push({ exerciseId, namePt, nameEn, displayName: namePt ?? nameEn ?? exerciseId ?? '', primary, secondary, equipment, sets, weightIncrement: inc, goal: egoal, notes, supersetGroup });
    });
    days.push({ name: dname, dayOfWeek: dow, exercises });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, plan: { name, description, language: typeof raw.language === 'string' ? raw.language : null, goal, defaultRestSeconds: defaultRest, days }, warnings };
}

/** Dados mínimos para exportar um plano (a app preenche nomes/músculos a partir da biblioteca). */
export interface ExportablePlan {
  name: string; description: string | null; goal: PlanGoal;
  days: { name: string; dayOfWeek: number | null; exercises: {
    exerciseId?: string; namePt: string | null; nameEn: string; primary: string[]; secondary: string[]; equipment: string; weightIncrement: number; goal: string | null; notes: string | null; supersetGroup: string | null;
    sets: { type: SetType; repMin: number; repMax: number; weight: number; restSeconds: number | null; rir: number | null }[];
  }[] }[];
}

export function buildPlanJson(p: ExportablePlan) {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION, type: 'workout_plan', name: p.name, description: p.description ?? '', language: 'pt-PT',
    settings: { goal: p.goal },
    days: p.days.map((d) => ({
      name: d.name, dayOfWeek: d.dayOfWeek,
      exercises: d.exercises.map((e) => ({
        ...(e.exerciseId ? { exerciseId: e.exerciseId } : {}), name: { pt: e.namePt ?? e.nameEn, en: e.nameEn }, muscleGroups: { primary: e.primary, secondary: e.secondary }, equipment: e.equipment,
        sets: e.sets.map((s) => ({ type: s.type, reps: s.repMin === s.repMax ? s.repMin : { min: s.repMin, max: s.repMax }, weight: s.weight, restSeconds: s.restSeconds, rir: s.rir })),
        weightIncrement: e.weightIncrement, goal: e.goal ?? p.goal, notes: e.notes ?? '', ...(e.supersetGroup ? { supersetGroup: e.supersetGroup } : {}),
      })),
    })),
  };
}
export const KNOWN_MUSCLES: readonly string[] = MUSCLE_KEYS;
export const KNOWN_EQUIPMENT: readonly string[] = EQUIPMENT_KEYS;

/** Ficheiro de "todos os planos" (type workout_plans) → lista de planos individuais (cada um passa por parsePlanJson). */
export function splitBundle(text: string): string[] | null {
  try {
    const raw = JSON.parse(text) as any;
    if (raw && raw.type === 'workout_plans' && Array.isArray(raw.plans)) return raw.plans.map((p: unknown) => JSON.stringify(p));
  } catch { /* não é JSON: parsePlanJson reporta */ }
  return null;
}
