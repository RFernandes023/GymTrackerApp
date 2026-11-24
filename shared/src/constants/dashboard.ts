export type DashboardGroup = 'nutrition' | 'training' | 'progress' | 'other';

export interface DashboardCardDef {
  type: string;
  title: string;
  group: DashboardGroup;
  /** Fase do plano em que o cartão passa a ter dados reais. */
  availableInPhase: number;
  defaultEnabled: boolean;
}

const d = (type: string, title: string, group: DashboardGroup, availableInPhase: number, defaultEnabled = false): DashboardCardDef =>
  ({ type, title, group, availableInPhase, defaultEnabled });

export const DASHBOARD_CARD_DEFS: readonly DashboardCardDef[] = [
  d('kcal_consumed', 'Calorias consumidas', 'nutrition', 3, true),
  d('kcal_goal', 'Objetivo calórico', 'nutrition', 3),
  d('kcal_remaining', 'Calorias restantes', 'nutrition', 3),
  d('macro_protein', 'Proteínas', 'nutrition', 3, true),
  d('macro_carbs', 'Hidratos de carbono', 'nutrition', 3),
  d('macro_fat', 'Gorduras', 'nutrition', 3),
  d('daily_progress', 'Progresso diário', 'nutrition', 3),
  d('next_workout', 'Próximo treino', 'training', 2, true),
  d('today_workout', 'Treino do dia', 'training', 2),
  d('last_workout', 'Último treino realizado', 'training', 2, true),
  d('week_workouts', 'Treinos na semana', 'training', 2, true),
  d('avg_duration', 'Duração média', 'training', 2),
  d('week_volume', 'Volume semanal', 'training', 2),
  d('weight_current', 'Peso atual', 'progress', 4, true),
  d('body_fat', 'Percentagem de gordura (estimativa)', 'progress', 4),
  d('muscle_mass', 'Massa muscular (estimativa)', 'progress', 4),
  d('bmi', 'IMC', 'progress', 4),
  d('waist_trend', 'Evolução da cintura', 'progress', 4),
  d('personal_records', 'Recordes pessoais', 'other', 2),
  d('streak', 'Sequência de treinos', 'other', 2),
  d('weekly_summary', 'Resumo semanal', 'other', 4),
  d('ai_suggestions', 'Sugestões do treinador IA', 'other', 5),
];

export const DASHBOARD_GROUP_LABELS: Record<DashboardGroup, string> = {
  nutrition: 'Nutrição', training: 'Treino', progress: 'Evolução', other: 'Outros',
};
