import type { LoggedSet, SetType } from '@gym/shared';
import { getDb } from '../../database/db';

export interface LastPerformance { sets: LoggedSet[]; performedAt: number }
/** Última sessão concluída com este exercício (séries concluídas, por ordem). */
export async function lastPerformance(userId: string, exerciseId: string, excludeSessionId?: string): Promise<LastPerformance | null> {
  const db = await getDb();
  const se = await db.getFirstAsync<{ id: string; completed_at: number }>(
    `SELECT se.id, s.completed_at FROM session_exercises se JOIN workout_sessions s ON s.id = se.session_id
     WHERE s.user_id = ? AND s.status = 'completed' AND se.exercise_id = ? AND s.id != ? AND EXISTS (SELECT 1 FROM session_sets x WHERE x.session_exercise_id = se.id AND x.completed = 1)
     ORDER BY s.completed_at DESC LIMIT 1`, userId, exerciseId, excludeSessionId ?? '');
  if (!se) return null;
  const rows = await db.getAllAsync<{ weight: number; reps: number; set_type: SetType }>('SELECT weight, reps, set_type FROM session_sets WHERE session_exercise_id = ? AND completed = 1 ORDER BY position', se.id);
  return { performedAt: se.completed_at, sets: rows.map((r) => ({ weight: r.weight, reps: r.reps, type: r.set_type })) };
}


/** Melhor 1RM estimado por sessão (antigo → recente), para deteção de estagnação. */
export async function bestsByExercise(userId: string, exerciseId: string, limit = 8): Promise<number[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ best: number }>(
    `SELECT MAX(CASE WHEN ss.reps <= 1 THEN ss.weight ELSE ss.weight * (1 + ss.reps / 30.0) END) AS best
     FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id JOIN workout_sessions w ON w.id = se.session_id
     WHERE w.user_id = ? AND w.status = 'completed' AND se.exercise_id = ? AND ss.completed = 1 AND ss.set_type != 'warmup'
     GROUP BY w.id ORDER BY w.completed_at DESC LIMIT ?`, userId, exerciseId, limit);
  return rows.map((r) => r.best).reverse();
}
