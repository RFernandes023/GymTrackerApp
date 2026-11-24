// Atualiza docs/plan-import.schema.json com os exercícios da biblioteca. Uso: node tools/build-plan-schema.mjs
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const file = new URL('docs/plan-import.schema.json', root);
const exercises = JSON.parse(fs.readFileSync(new URL('mobile/assets/exercises.json', root), 'utf8'));
const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
const ex = schema.properties.days.items.properties.exercises.items;
const { name, exerciseId: _old, ...rest } = ex.properties;
ex.required = ['sets'];
ex.anyOf = [{ required: ['exerciseId'] }, { required: ['name'] }];
ex.properties = { exerciseId: { description: 'ID do exercício na app (recomendado). Tem prioridade sobre o nome.', anyOf: [{ $ref: '#/$defs/libraryExerciseId' }, { type: 'string', format: 'uuid', pattern: '^[0-9a-fA-F-]{36}$', description: 'Exercício personalizado do utilizador.' }] }, name, ...rest };
schema.$defs = { libraryExerciseId: { description: 'Exercícios da biblioteca da app.', oneOf: exercises.map((e) => ({ const: e.id, title: e.pt ?? e.en, description: `${e.en} · ${e.primary.join(', ')} · ${e.equipment}` })) } };
fs.writeFileSync(file, JSON.stringify(schema, null, 2).replace(/\{\n\s+"const": (.*),\n\s+"title": (.*),\n\s+"description": (.*)\n\s+\}/g, '{ "const": $1, "title": $2, "description": $3 }') + '\n');
console.log(exercises.length + ' exercícios no schema');
