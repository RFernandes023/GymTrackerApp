import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migrações versionadas via PRAGMA user_version. Nunca editar uma migração já publicada: acrescentar uma nova.
 * Todas as entidades sincronizáveis usam id UUID (texto) + created_at/updated_at (ms) + deleted_at (soft delete).
 */
const MIGRATIONS: string[] = [
  // v1 — fundação
  `
  CREATE TABLE kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE dashboard_cards (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    position INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user_id, type)
  );
  CREATE INDEX idx_dashboard_user ON dashboard_cards (user_id, position);
  CREATE TABLE sync_queue (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE INDEX idx_sync_user_created ON sync_queue (user_id, created_at);
  `,
  // v2 — treino
  `
  CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name_pt TEXT,
    name_en TEXT NOT NULL,
    alt_name TEXT,
    primary_muscles TEXT NOT NULL,
    secondary_muscles TEXT NOT NULL DEFAULT '[]',
    equipment TEXT NOT NULL DEFAULT 'other',
    ex_type TEXT,
    description TEXT,
    instructions TEXT NOT NULL DEFAULT '[]',
    images TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX idx_ex_user ON exercises (user_id);
  CREATE INDEX idx_ex_name ON exercises (name_en);
  CREATE TABLE workout_plans (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX idx_plans_user ON workout_plans (user_id, deleted_at);
  CREATE TABLE plan_days (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    day_of_week INTEGER,
    position INTEGER NOT NULL
  );
  CREATE TABLE plan_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    weight_increment REAL NOT NULL DEFAULT 2.5,
    rest_seconds INTEGER NOT NULL DEFAULT 90,
    goal TEXT,
    notes TEXT,
    superset_group TEXT
  );
  CREATE TABLE plan_sets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_exercise_id TEXT NOT NULL REFERENCES plan_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    set_type TEXT NOT NULL,
    rep_min INTEGER NOT NULL,
    rep_max INTEGER NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    rest_seconds INTEGER,
    rir INTEGER
  );
  CREATE TABLE workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    plan_day_id TEXT,
    plan_version INTEGER,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active','completed','discarded')),
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    duration_ms INTEGER,
    total_volume REAL,
    rest_ends_at INTEGER,
    rest_total_ms INTEGER,
    summary_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_sessions_user ON workout_sessions (user_id, status, started_at);
  CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    weight_increment REAL NOT NULL,
    rest_seconds INTEGER NOT NULL,
    rep_min INTEGER NOT NULL,
    rep_max INTEGER NOT NULL,
    superset_group TEXT,
    notes TEXT,
    started_at INTEGER,
    completed_at INTEGER
  );
  CREATE INDEX idx_se_exercise ON session_exercises (exercise_id);
  CREATE TABLE session_sets (
    id TEXT PRIMARY KEY NOT NULL,
    session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    set_type TEXT NOT NULL,
    target_rep_min INTEGER NOT NULL,
    target_rep_max INTEGER NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    rir INTEGER,
    rpe REAL,
    rest_seconds INTEGER NOT NULL DEFAULT 90,
    completed INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    duration_ms INTEGER,
    is_extra INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_ss_se ON session_sets (session_exercise_id, position);
  CREATE TABLE personal_records (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    value REAL NOT NULL,
    session_id TEXT NOT NULL,
    achieved_at INTEGER NOT NULL
  );
  CREATE INDEX idx_pr_user ON personal_records (user_id, achieved_at);
  `,
  // v3 — nutrição
  `
  CREATE TABLE foods (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    barcode TEXT,
    source TEXT NOT NULL CHECK (source IN ('openfoodfacts','custom','label_ocr')),
    base_unit TEXT NOT NULL CHECK (base_unit IN ('g','ml')),
    kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
    sat_fat REAL, sugars REAL, fiber REAL, salt REAL,
    serving_size REAL,
    serving_label TEXT,
    unit_weight REAL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX idx_foods_user_name ON foods (user_id, name);
  CREATE UNIQUE INDEX idx_foods_user_barcode ON foods (user_id, barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL;
  CREATE TABLE nutrition_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    meal TEXT NOT NULL,
    food_id TEXT,
    recipe_id TEXT,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    amount REAL,
    kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL, fiber REAL NOT NULL DEFAULT 0,
    per_unit TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX idx_entries_user_date ON nutrition_entries (user_id, date, deleted_at);
  CREATE TABLE nutrition_goals (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    calories REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
    start_date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, start_date)
  );
  CREATE TABLE recipes (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    servings REAL NOT NULL DEFAULT 1,
    notes TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_meal_prep INTEGER NOT NULL DEFAULT 0,
    remaining_portions REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX idx_recipes_user ON recipes (user_id, deleted_at);
  CREATE TABLE recipe_ingredients (
    id TEXT PRIMARY KEY NOT NULL,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    food_id TEXT,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    amount REAL,
    kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL, fiber REAL NOT NULL DEFAULT 0,
    per_unit TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  `,
  // v4 — objetivo do plano, evolução física, mensagens do treinador IA
  `
  ALTER TABLE workout_plans ADD COLUMN goal TEXT NOT NULL DEFAULT 'hypertrophy';
  CREATE TABLE body_measurements (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    weight REAL,
    body_fat REAL, body_fat_source TEXT CHECK (body_fat_source IN ('estimate','measured')),
    muscle_mass REAL, muscle_source TEXT CHECK (muscle_source IN ('estimate','measured')),
    bmi REAL,
    neck REAL, waist REAL, hip REAL, chest REAL, arms REAL, forearms REAL, thighs REAL, calves REAL,
    custom TEXT NOT NULL DEFAULT '{}',
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE UNIQUE INDEX idx_meas_user_date ON body_measurements (user_id, date) WHERE deleted_at IS NULL;
  CREATE TABLE ai_messages (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    proposal_json TEXT,
    proposal_status TEXT CHECK (proposal_status IN ('pending','accepted','rejected')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_ai_user ON ai_messages (user_id, created_at);
  `,
  // v5 — sincronização
  `
  CREATE TABLE sync_state (
    user_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
    server_version INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, entity, entity_id)
  );
  CREATE TABLE sync_conflicts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
    local_payload TEXT, server_payload TEXT, server_deleted INTEGER NOT NULL DEFAULT 0, server_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, entity, entity_id)
  );
  ALTER TABLE sync_queue ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
  `,
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  for (; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version]!;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
