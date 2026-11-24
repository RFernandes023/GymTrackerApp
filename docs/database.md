# Base de dados

## SQLite (dispositivo) — migração v1
- `kv(key, value, updated_at)` — utilizador em cache e pequenas configurações.
- `dashboard_cards(id UUID, user_id, type, position, enabled, created_at, updated_at, UNIQUE(user_id,type))`.
- `sync_queue(id UUID, user_id, entity, entity_id, op upsert|delete, payload JSON, created_at, attempts, last_error)`.
Migrações via `PRAGMA user_version` (`mobile/database/migrations.ts`); nunca editar migrações publicadas.

## SQLite — migração v2 (treino)
`exercises` (seed `ffd:<id>` + personalizados UUID), `workout_plans` (versão + soft delete), `plan_days`, `plan_exercises` (incremento, descanso, superset_group),
`plan_sets` (tipo, reps min/max, peso, descanso, RIR), `workout_sessions` (status active|completed|discarded, `rest_ends_at` para o descanso sobreviver a fecho da app),
`session_exercises`, `session_sets` (peso, reps, RIR, RPE, started/completed_at, duration_ms), `personal_records`.
Sessões concluídas guardam um instantâneo (nome, objetivo, séries) — editar/apagar um plano nunca altera o histórico.
O seed (`exerciseSeed.ts`) é idempotente e versionado (`kv: exercises.seed`).

## SQLite — migração v3 (nutrição)
`foods` (por utilizador; valores **por 100 g/ml**; origem openfoodfacts|custom|label_ocr; índice único parcial por código de barras), `nutrition_entries`
(instantâneo dos macros + `per_unit` com precisão total para reescalar ao editar; soft delete), `nutrition_goals` (histórico por `start_date`),
`recipes` (+ meal prep: `remaining_portions`), `recipe_ingredients` (instantâneo). O perfil corporal e as refeições personalizadas ficam em `kv` por utilizador.
Apagar um alimento/receita nunca altera registos já feitos no diário.

## MongoDB (cloud) — implementado na Fase 1
- `users`: googleId (único), email (índice), name, picture, profile, preferences, timestamps.
- `refreshtokens`: hash (único), userId (índice), expiresAt (índice TTL).
Restantes coleções do brief são criadas nas fases respetivas. `USER_OWNED_COLLECTIONS` em `mongoStore.ts`
lista as coleções apagadas em `DELETE /me` — **acrescentar cada nova coleção com `userId`**.
