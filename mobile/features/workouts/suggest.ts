import { suggestStartingWeight, type StartingWeight, type TrainingGoal } from '@gym/shared';
import { getBodyInfo } from '../profile/profileRepo';
import { getExercise } from './exercisesRepo';

/** Carga inicial estimada para um exercício (só se o perfil corporal estiver preenchido). */
export async function suggestionFor(userId: string, exerciseId: string, goal: TrainingGoal, increment?: number): Promise<StartingWeight | null> {
  const [body, ex] = await Promise.all([getBodyInfo(userId), getExercise(exerciseId)]);
  return body && ex ? suggestStartingWeight(ex, body, goal, increment) : null;
}
