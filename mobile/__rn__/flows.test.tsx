import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { device, routerMock, setParams, USER } from './harness';
import { parsePlanJson } from '@gym/shared';
import { aiPlanInstructions } from '../features/exchange/planImport';
import { createCustomExercise, searchExercises } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as foods from '../features/nutrition/foodsRepo';
import * as nut from '../features/nutrition/nutritionRepo';
import * as meas from '../features/progress/measurementsRepo';
import { saveBasics } from '../features/profile/profileRepo';
import { getConsent } from '../features/ai/consent';

import ImportPlan from '../app/import-plan';
import Diary from '../app/(tabs)/nutrition';
import Progress from '../app/(tabs)/progress';
import NewMeasurement from '../app/progress/new';
import Coach from '../app/coach';
import Library from '../app/exercises/index';
import Plans from '../app/plans/index';
import PlanEditor from '../app/plans/[id]';
import Settings from '../app/settings';

beforeEach(async () => { await device(); jest.clearAllMocks(); setParams({}); (global as any).__clipboard = ''; });

const BRIEF = { schemaVersion: '1.0', type: 'workout_plan', name: 'Upper Body', description: 'Plano de hipertrofia', language: 'pt-PT', settings: { goal: 'hypertrophy', restBetweenExercises: 120 },
  days: [{ name: 'Upper A', dayOfWeek: 1, exercises: [{ name: { pt: 'Supino plano com barra', en: 'Barbell Bench Press' }, muscleGroups: { primary: ['chest'], secondary: ['triceps', 'front_delts'] }, equipment: 'barbell',
    sets: [{ type: 'warmup', reps: { min: 12, max: 15 }, weight: 20, restSeconds: 60 }, { type: 'working', reps: { min: 8, max: 12 }, weight: 60, restSeconds: 120, rir: null }], weightIncrement: 2.5, goal: 'hypertrophy', notes: 'Controlar a descida' }] }] };

describe('Importar plano (JSON)', () => {
  it('colar → pré-visualizar → confirmar cria o plano', async () => {
    (global as any).__clipboard = JSON.stringify(BRIEF);
    await render(<ImportPlan />);
    await fireEvent.press(screen.getByRole('button', { name: 'Colar da área de transferência' }));
    expect(await screen.findByText(/Pré-visualização/)).toBeTruthy();
    expect(screen.getByDisplayValue('Upper Body')).toBeTruthy();
    expect(screen.getByText('Supino plano com barra')).toBeTruthy();
    expect(screen.getByText('Encontrado na biblioteca')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect(await screen.findByText('Plano importado')).toBeTruthy();
    const list = await plans.listPlans(USER.id); expect(list.map((p) => p.name)).toEqual(['Upper Body']);
    expect((await plans.getPlan(list[0]!.id))!.days[0]!.exercises[0]!.sets).toHaveLength(2);
  });
  it('exerciseId escolhe o exercício exato, mesmo sem nome', async () => {
    const id = (await searchExercises(USER.id, { query: 'Remada curvada com barra' }))[0]!.id;
    (global as any).__clipboard = JSON.stringify({ ...BRIEF, days: [{ name: 'D', exercises: [{ exerciseId: id, sets: [{ reps: 8 }] }] }] });
    await render(<ImportPlan />);
    await fireEvent.press(screen.getByRole('button', { name: 'Colar da área de transferência' }));
    expect(await screen.findByText('Encontrado na biblioteca')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText('Plano importado');
    const list = await plans.listPlans(USER.id);
    expect((await plans.getPlan(list[0]!.id))!.days[0]!.exercises[0]!.exerciseId).toBe(id);
  });
  it('copiar instruções para IA inclui a biblioteca toda e os personalizados', async () => {
    const mine = await createCustomExercise(USER.id, { namePt: 'Prensa minha', primary: ['quads'], equipment: 'machine' });
    const text = await aiPlanInstructions(USER.id);
    const lib = require('../assets/exercises.json') as { id: string }[];
    expect(lib.every((e) => text.includes(e.id + ' | '))).toBe(true); expect(text).toContain(mine.id);
    expect(parsePlanJson(text.split('EXEMPLO:')[1]!.split('LISTA')[0]!).ok).toBe(true);
    const schema = require('../../docs/plan-import.schema.json');
    expect(schema.$defs.libraryExerciseId.oneOf.map((o: any) => o.const)).toEqual(lib.map((e) => e.id)); // schema atualizado
  });
  it('JSON inválido mostra os erros e NÃO importa', async () => {
    await render(<ImportPlan />);
    await fireEvent.changeText(screen.getByPlaceholderText(/schemaVersion/), JSON.stringify({ ...BRIEF, days: [{ name: 'D', exercises: [{ name: 'X', sets: [{ reps: 'muitas' }] }] }] }));
    await fireEvent.press(screen.getByRole('button', { name: 'Validar e pré-visualizar' }));
    expect(await screen.findByText(/JSON inválido — corrige/)).toBeTruthy();
    expect(screen.getByText(/days\[0\]\.exercises\[0\]\.sets\[0\]\.reps/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
    expect(await plans.listPlans(USER.id)).toHaveLength(0);
  });
});

describe('Nutrição: diário', () => {
  it('mostra refeições, o alimento registado e os totais; "+ Adicionar" navega com data e refeição', async () => {
    const f = await foods.saveFood(USER.id, { name: 'Aveia', brand: null, barcode: null, baseUnit: 'g', per100: { kcal: 370, protein: 13, carbs: 60, fat: 7 }, servingSize: null, servingLabel: null, unitWeight: null, source: 'custom' });
    const today = new Date(); const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await nut.logFood(USER.id, { date: key, meal: 'breakfast', food: f, quantity: 80, unit: 'g' });
    await render(<Diary />);
    expect(await screen.findByText('Aveia')).toBeTruthy();
    expect(screen.getByText('Pequeno-almoço')).toBeTruthy(); expect(screen.getByText('Hoje')).toBeTruthy();
    expect((await screen.findAllByText(/296/)).length).toBeGreaterThanOrEqual(2);
    await fireEvent.press(screen.getAllByRole('button', { name: '+ Adicionar alimento' })[0]!);
    expect(routerMock().push).toHaveBeenCalledWith({ pathname: '/nutrition/add', params: { date: key, meal: 'breakfast' } });
  });
});

describe('Evolução', () => {
  it('mostra o peso e o IMC; novo registo guarda e calcula IMC/estimativas', async () => {
    await saveBasics(USER.id, { sex: 'male', age: 30, heightCm: 180 });
    await meas.saveMeasurement(USER.id, { date: new Date().toISOString().slice(0, 10), weight: 80, waist: 85 });
    await render(<Progress />);
    expect(await screen.findByText('Evolução')).toBeTruthy();
    expect(await screen.findAllByText(/80/)).toBeTruthy();
    expect(screen.getByText('calculado automaticamente')).toBeTruthy();
    expect(screen.getAllByText('estimativa').length).toBeGreaterThan(0);
  });
  it('formulário: peso inválido mostra erro; válido guarda e volta', async () => {
    await saveBasics(USER.id, { sex: 'male', age: 30, heightCm: 180 });
    await render(<NewMeasurement />);
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '5,5x');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/número inválido/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '81,5');
    await waitFor(() => expect(screen.getByText(/IMC: 25/)).toBeTruthy());      // pré-visualização automática
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect((await meas.listMeasurements(USER.id)).map((m) => m.weight)).toEqual([81.5]));
    expect(routerMock().back).toHaveBeenCalled();
  });
});

describe('Treinador IA', () => {
  it('sem consentimento mostra o aviso (incl. free tier) e só depois permite usar; sem rede dá erro claro', async () => {
    await render(<Coach />);
    expect(await screen.findByText('Antes de usares a IA')).toBeTruthy();
    expect(screen.getByText(/Google pode usar o conteúdo/)).toBeTruthy();
    expect(screen.getByText('Análise local')).toBeTruthy();                       // funciona sem IA
    await fireEvent.press(screen.getByRole('button', { name: 'Aceito e quero usar o Treinador IA' }));
    expect(await screen.findByRole('button', { name: 'Analisar progressão' })).toBeTruthy();
    expect(await getConsent(USER.id)).not.toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText(/Pergunta ou pede/), 'Olá');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Sem ligação à internet/)).toBeTruthy();
  });
});

describe('Biblioteca, planos e definições', () => {
  it('biblioteca: pesquisa, filtra por músculo e limpa o filtro', async () => {
    await render(<Library />);
    await fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'Rosca direta');
    expect(await screen.findByText('Rosca direta com barra', undefined, { timeout: 3000 })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Costas' }));            // bíceps não são costas
    await waitFor(() => expect(screen.queryByText('Rosca direta com barra')).toBeNull(), { timeout: 3000 });
    await fireEvent.press(screen.getByRole('button', { name: 'Todos os músculos' }));
    expect(await screen.findByText('Rosca direta com barra', undefined, { timeout: 3000 })).toBeTruthy();
  });
  it('planos: lista, duplica e abre o editor; objetivo do plano muda na BD', async () => {
    const id = await plans.createPlan(USER.id, 'Meu plano');
    await render(<Plans />);
    expect(await screen.findByText('Meu plano')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Duplicar' }));
    expect(await screen.findByText('Meu plano (cópia)')).toBeTruthy();
    setParams({ id });
    const view = await render(<PlanEditor />);
    expect(await screen.findByText(/Objetivo do plano/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Força' }));
    await waitFor(async () => expect((await plans.getPlan(id))!.goal).toBe('strength'));
    view.unmount();
  });
  it('definições: ligações para importar, exportar, notificações, sincronização e privacidade', async () => {
    await render(<Settings />);
    for (const [label, path] of [['Importar plano (JSON)', '/import-plan'], ['Exportar dados', '/export'], ['Notificações', '/notifications'], ['Sincronização', '/sync'], ['Política de privacidade', '/privacy'], ['Perfil corporal', '/profile']] as const) {
      await fireEvent.press(screen.getByRole('button', { name: label })); expect(routerMock().push).toHaveBeenCalledWith(path);
    }
    expect(screen.getByRole('button', { name: 'Eliminar conta e dados' })).toBeTruthy();
  });
});
