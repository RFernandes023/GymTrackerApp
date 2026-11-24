import type { SetType } from '@gym/shared';

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] as const;
export type Muscle = (typeof MUSCLES)[number];
export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', forearms: 'Antebraços',
  abs: 'Abdominais', quads: 'Quadríceps', hamstrings: 'Isquiotibiais', glutes: 'Glúteos', calves: 'Gémeos', adductors: 'Adutores', abductors: 'Abdutores',
};
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'bands', 'other'] as const;
export const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barra', dumbbell: 'Halteres', machine: 'Máquina', cable: 'Polia', bodyweight: 'Peso corporal', kettlebell: 'Kettlebell', bands: 'Elásticos', other: 'Outro',
};
export const EXERCISE_TYPE_LABELS: Record<string, string> = { compound: 'Composto', isolation: 'Isolamento' };

export interface Exercise {
  id: string; userId: string | null; namePt: string | null; nameEn: string; altName: string | null;
  primary: string[]; secondary: string[]; equipment: string; type: string | null;
  description: string | null; instructions: string[]; images: string[]; isCustom: boolean;
}
export const exerciseName = (e: { namePt: string | null; nameEn: string }) => e.namePt ?? e.nameEn;

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
/** Imagens do Free Exercise DB são servidas do repositório (requer internet; sem ligação mostra-se o placeholder). */
export const exerciseImageUrl = (e: Exercise): string | null => (e.images[0] && !e.isCustom ? IMG_BASE + e.images[0] : null);

export interface PlanSet { id: string; position: number; type: SetType; repMin: number; repMax: number; weight: number; restSeconds: number | null; rir: number | null }
export interface PlanExercise {
  id: string; exerciseId: string; name: string; position: number; weightIncrement: number; restSeconds: number;
  goal: string | null; notes: string | null; supersetGroup: string | null; sets: PlanSet[];
}
export interface PlanDay { id: string; name: string; dayOfWeek: number | null; position: number; exercises: PlanExercise[] }
export interface Plan { id: string; name: string; description: string | null; goal: 'hypertrophy' | 'strength' | 'endurance'; isActive: boolean; version: number; updatedAt: number; days: PlanDay[] }

export const DAY_LABELS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export interface SessionSet {
  id: string; position: number; type: SetType; targetRepMin: number; targetRepMax: number; weight: number; reps: number;
  rir: number | null; rpe: number | null; restSeconds: number; completed: boolean; startedAt: number | null; completedAt: number | null;
  durationMs: number | null; isExtra: boolean;
}
export interface SessionExercise {
  id: string; exerciseId: string; position: number; name: string; weightIncrement: number; restSeconds: number;
  repMin: number; repMax: number; supersetGroup: string | null; notes: string | null; sets: SessionSet[];
}
export interface Session {
  id: string; planId: string | null; planDayId: string | null; name: string; status: 'active' | 'completed' | 'discarded';
  startedAt: number; completedAt: number | null; durationMs: number | null; totalVolume: number | null; restEndsAt: number | null; restTotalMs: number | null;
  summary: SessionSummary | null; exercises: SessionExercise[];
}
export interface SessionSummary {
  durationMs: number; exercisesDone: number; setsDone: number; totalReps: number; volume: number;
  records: { exerciseName: string; kind: 'weight' | 'e1rm'; value: number }[];
  previous: { volume: number; durationMs: number; sets: number } | null;
}
