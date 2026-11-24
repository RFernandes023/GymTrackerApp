# Formato JSON (`schemaVersion` 1.x)

Todos os ficheiros exportados têm `schemaVersion`, `type`, `exportedAt` e `app`. **Só planos (`workout_plan`) podem ser importados**; os restantes tipos são exportações/backups legíveis.
A app lê qualquer `1.x`; uma versão `2.0` é recusada com mensagem clara.

## Importar: Definições → Importar plano (JSON)
1. Cola o JSON (ou toca em "Colar da área de transferência") e toca em **Validar e pré-visualizar**.
2. Se houver erros, aparecem **todos**, com o caminho do campo (ex.: `days[0].exercises[1].sets[2].reps: …`). **Nada é importado** enquanto o JSON for inválido.
3. Na pré-visualização podes mudar o nome do plano, o objetivo, o nome de cada dia e decidir por exercício: usar o da biblioteca, usar uma **sugestão**, **criar personalizado** ou **ignorar**.
4. **Confirmar importação** cria o plano numa única transação (ou entra tudo ou nada).
Um ficheiro "todos os planos" (`workout_plans`) mostra a lista; importas um plano de cada vez.

## `workout_plan`

O JSON Schema formal está disponível em [`plan-import.schema.json`](./plan-import.schema.json). Inclui os IDs de todos os exercícios da biblioteca; regenera-o com `node tools/build-plan-schema.mjs` quando `exercises.json` mudar. Na app, **Importar plano → Copiar instruções e exercícios** dá o mesmo a uma IA, com os teus exercícios personalizados. O exemplo abaixo é o formato canónico recomendado.
```json
{
  "schemaVersion": "1.0",
  "type": "workout_plan",
  "name": "Upper Body",
  "description": "Plano de hipertrofia",
  "language": "pt-PT",
  "settings": { "goal": "hypertrophy", "restBetweenExercises": 120 },
  "days": [
    {
      "name": "Upper A",
      "dayOfWeek": 1,
      "exercises": [
        {
          "exerciseId": "Barbell_Bench_Press_-_Medium_Grip",
          "name": { "pt": "Supino plano com barra", "en": "Barbell Bench Press" },
          "muscleGroups": { "primary": ["chest"], "secondary": ["triceps", "front_delts"] },
          "equipment": "barbell",
          "sets": [
            { "type": "warmup", "reps": { "min": 12, "max": 15 }, "weight": 20, "restSeconds": 60 },
            { "type": "working", "reps": { "min": 8, "max": 12 }, "weight": 60, "restSeconds": 120, "rir": null }
          ],
          "weightIncrement": 2.5,
          "goal": "hypertrophy",
          "notes": "Controlar a descida",
          "supersetGroup": "A"
        }
      ]
    }
  ]
}
```

| Campo | Regras |
|---|---|
| `type` | obrigatório, `"workout_plan"` |
| `schemaVersion` | obrigatório, `"1"` ou `"1.x"` |
| `name` | obrigatório, 1–60 caracteres |
| `description`, `language` | opcionais |
| `settings.goal` | `hypertrophy` \| `strength` \| `endurance` (outro valor → aviso, usa `hypertrophy`) |
| `settings.restBetweenExercises` | segundos 0–1800; usado quando uma série não define `restSeconds` |
| `days` | 1–7 |
| `days[].name` | obrigatório, 1–40 |
| `days[].dayOfWeek` | `null` (plano flexível) ou 1 (segunda) … 7 (domingo) |
| `days[].exercises` | 1–15 |
| `exercises[].exerciseId` | opcional mas **recomendado**: ID de um exercício da app (lista no JSON Schema). Se existir, tem prioridade sobre o nome; se não existir, procura-se pelo nome |
| `exercises[].name` | (opcional com `exerciseId`) texto **ou** `{ "pt": "...", "en": "..." }` (pelo menos um) |
| `exercises[].muscleGroups` | `primary[]`, `secondary[]`; aliases aceites (`front_delts`→`shoulders`, `lats`→`back`, `core`→`abs`, `quadriceps`→`quads`, …); desconhecidos → aviso. Os músculos principais permitem criar o exercício personalizado se não existir |
| `exercises[].equipment` | `barbell, dumbbell, machine, cable, bodyweight, kettlebell, bands, other` (desconhecido → `other` + aviso) |
| `exercises[].sets` | 1–15 séries |
| `sets[].type` | `warmup`, `working` (omitido = `working`), `drop`, `rest_pause`, `failure` (aliases: `drop_set`, `restpause`, `to_failure`) |
| `sets[].reps` | inteiro 1–100 **ou** `{ "min": n, "max": n }` com `max ≥ min` |
| `sets[].weight` | kg, 0–500 (omitido = 0 → a app sugere/usa histórico) |
| `sets[].restSeconds` | inteiro 0–1800 ou `null` |
| `sets[].rir` | inteiro 0–5 ou `null` |
| `exercises[].weightIncrement` | kg > 0 (omitido = pelo equipamento: halteres 2, máquina 5, outros 2,5) |
| `exercises[].goal` | como `settings.goal` |
| `exercises[].notes` | até 300 caracteres |
| `exercises[].supersetGroup` | texto; exercícios do **mesmo dia** com o mesmo valor formam uma superset (grupo com 1 só membro é ignorado) |

## Outros tipos exportados
- `workout_plans`: `{ plans: [ <workout_plan>, … ] }`
- `custom_exercises`: `{ exercises: [{ namePt, nameEn, altName, primaryMuscles[], secondaryMuscles[], equipment, type, description, instructions[] }] }`
- `workout_history`: `{ sessions: [{ date, name, startedAt, completedAt, durationSeconds, totalVolumeKg, exercises: [{ name, sets: [{ type, weightKg, reps, rir, rpe, durationSeconds, completedAt }] }] }] }` (só sessões concluídas)
- `nutrition_data`: `{ goals[], entries[], foods[], recipes[], bodyMeasurements[] }` (valores por 100 g/ml nos alimentos; `kcal`, `protein`, `carbs`, `fat`, `fiber` nas entradas)

Exportar um plano e importá-lo de volta reproduz o mesmo plano (testado automaticamente, incluindo drop sets, rest-pause, falha e supersets).
