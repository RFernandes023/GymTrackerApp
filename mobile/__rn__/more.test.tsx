import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { device, routerMock, setParams, USER } from './harness';
import { searchExercises } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import * as foods from '../features/nutrition/foodsRepo';
import * as nut from '../features/nutrition/nutritionRepo';
import * as recipes from '../features/nutrition/recipesRepo';
import { getBodyInfo, saveBasics } from '../features/profile/profileRepo';
import { getPrefs } from '../features/notifications/reminders';

import ExerciseDetail from '../app/exercises/[id]';
import NewExercise from '../app/exercises/new';
import PlanEditor from '../app/plans/[id]';
import AddFood from '../app/nutrition/add';
import LogScreen from '../app/nutrition/log';
import FoodForm from '../app/nutrition/food-form';
import Scan from '../app/nutrition/scan';
import LabelScan from '../app/nutrition/label';
import Goals from '../app/nutrition/goals';
import MealPhoto from '../app/nutrition/meal-photo';
import Recipes from '../app/recipes/index';
import RecipeEditor from '../app/recipes/[id]';
import History from '../app/workout/history';
import Summary from '../app/workout/summary/[id]';
import ExportScreen from '../app/export';
import SyncScreen from '../app/sync';
import NotificationsScreen from '../app/notifications';
import ProfileScreen from '../app/profile';
import Privacy from '../app/privacy';
import ExerciseFilters from '../app/exercises/index';

beforeEach(async () => { await device(); jest.clearAllMocks(); setParams({}); });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const oats = { name: 'Aveia', brand: null, barcode: null, baseUnit: 'g' as const, per100: { kcal: 370, protein: 13, carbs: 60, fat: 7 }, servingSize: 40, servingLabel: '40 g', unitWeight: null, source: 'custom' as const };
const ex = async (q: string) => (await searchExercises(USER.id, { query: q }))[0]!;
async function finishedSession() {
  const planId = await plans.createPlan(USER.id, 'Upper'); const dayId = (await plans.getPlan(planId))!.days[0]!.id;
  await plans.addExerciseToDay(planId, dayId, (await ex('Supino plano com barra')).id, { weight: 60, sets: 2 });
  const sid = await sessions.startSession(USER.id, planId, dayId);
  for (const s of (await sessions.getSession(sid))!.exercises[0]!.sets) await sessions.completeSet(sid, s.id);
  await sessions.finishSession(USER.id, sid); return { planId, dayId, sid };
}

describe('Exercícios', () => {
  it('detalhe mostra nomes, músculos, instruções e a fonte da imagem', async () => {
    const e = await ex('Supino plano com barra'); setParams({ id: e.id });
    await render(<ExerciseDetail />);
    expect(await screen.findByText('Supino plano com barra')).toBeTruthy();
    expect(screen.getByText(/Principal: Peito/)).toBeTruthy(); expect(screen.getByText(/Instruções/)).toBeTruthy(); expect(screen.getByText(/Free Exercise DB/)).toBeTruthy();
    expect(screen.getAllByTestId('expo-image').length).toBeGreaterThan(0);          // média do exercício
  });
  it('novo exercício: valida o nome e guarda como personalizado', async () => {
    await render(<NewExercise />);
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar exercício' }));
    expect(await screen.findByText(/Indica o nome em português/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nome (português)'), 'Prensa personalizada');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Quadríceps' })[0]!);   // 1.ª linha = músculo principal
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar exercício' }));
    await waitFor(async () => expect((await searchExercises(USER.id, { query: 'Prensa personalizada' }))[0]).toMatchObject({ isCustom: true, primary: ['quads'] }));
  });
  it('filtros: as 3 linhas de chips existem (músculo, equipamento, tipo)', async () => {
    await render(<ExerciseFilters />);
    for (const n of ['Todos os músculos', 'Todo o equipamento', 'Composto', 'Isolamento', 'Barra', 'Halteres']) expect(screen.getByRole('button', { name: n })).toBeTruthy();
  });
});

describe('Planos: configuração do exercício', () => {
  it('abre o modal, mostra o objetivo e guarda', async () => {
    await saveBasics(USER.id, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
    const planId = await plans.createPlan(USER.id, 'P'); const dayId = (await plans.getPlan(planId))!.days[0]!.id;
    await plans.addExerciseToDay(planId, dayId, (await ex('Supino plano com barra')).id);
    setParams({ id: planId });
    await render(<PlanEditor />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar Supino plano com barra' }));
    expect(await screen.findByText('Séries efetivas')).toBeTruthy();
    expect(screen.getByText(/Objetivo \(ajusta repetições e descanso\)/)).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Força' }).at(-1)!);     // muda reps/descanso e recalcula a carga estimada
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => { const s = (await plans.getPlan(planId))!.days[0]!.exercises[0]!.sets[0]!; expect(s.repMax).toBe(6); expect(s.restSeconds).toBe(180); });
  });
});

describe('Nutrição: adicionar, registar, criar, OCR, objetivos', () => {
  it('adicionar: lista alimentos guardados, abre o registo e mostra os atalhos', async () => {
    const f = await foods.saveFood(USER.id, oats); await foods.touchFood(USER.id, f.id);
    setParams({ date: today(), meal: 'lunch' });
    await render(<AddFood />);
    expect(await screen.findByText('Aveia')).toBeTruthy();
    for (const n of ['Ler código de barras', 'Fotografar rótulo', 'Criar manualmente', 'Receitas']) expect(screen.getByRole('button', { name: n })).toBeTruthy();
    await fireEvent.press(screen.getByText('Aveia'));
    expect(routerMock().push).toHaveBeenCalledWith({ pathname: '/nutrition/log', params: { foodId: f.id, date: today(), meal: 'lunch' } });
  });
  it('registo: mostra valores para a quantidade e adiciona ao diário', async () => {
    const f = await foods.saveFood(USER.id, oats); setParams({ foodId: f.id, date: today(), meal: 'breakfast' });
    await render(<LogScreen />);
    expect(await screen.findByText('Aveia')).toBeTruthy();
    expect(await screen.findByText('148 kcal')).toBeTruthy();                           // 1 dose = 40 g
    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar ao diário' }));
    await waitFor(async () => expect((await nut.getDay(USER.id, today())).totals.kcal).toBe(148));
    expect(routerMock().dismissTo).toHaveBeenCalled();
  });
  it('novo alimento: valida e guarda; valores impossíveis são bloqueados', async () => {
    setParams({ date: today(), meal: 'snack' });
    await render(<FoodForm />);
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Barra de cereais');
    for (const [l, v] of [['Calorias (kcal)', '1200'], ['Proteínas (g)', '5'], ['Hidratos de carbono (g)', '60'], ['Gorduras (g)', '10']] as const) await fireEvent.changeText(screen.getByLabelText(l), v);
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/900 kcal/)).toBeTruthy();                           // 1200 kcal/100 g é impossível
    await fireEvent.changeText(screen.getByLabelText('Calorias (kcal)'), '390');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect((await foods.searchFoods(USER.id, { query: 'Barra de cereais' }))[0]!.per100.kcal).toBe(390));
    expect(routerMock().replace).toHaveBeenCalled();
  });
  it('scanner: código inválido não pesquisa; sem rede e sem produto local dá mensagem e criação manual', async () => {
    (global as any).fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }); // sem rede
    await render(<Scan />);
    expect(screen.getByRole('button', { name: 'Procurar' }).props.accessibilityState?.disabled).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Ou escreve o código'), '5601234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Procurar' }));
    expect(await screen.findByText(/Sem ligação à internet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar manualmente' })).toBeTruthy();
  });
  it('scanner: produto já guardado abre o registo, mesmo offline', async () => {
    const f = await foods.saveFood(USER.id, { ...oats, barcode: '5601234567890' });
    await render(<Scan />);
    await fireEvent.changeText(screen.getByLabelText('Ou escreve o código'), '5601234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Procurar' }));
    await waitFor(() => expect(routerMock().replace).toHaveBeenCalledWith({ pathname: '/nutrition/log', params: { foodId: f.id, date: undefined, meal: undefined } }));
  });
  it('rótulo: introdução manual, conversão de dose para 100 g e confirmação', async () => {
    await render(<LabelScan />);
    await fireEvent.press(screen.getByRole('button', { name: 'Introduzir manualmente' }));
    expect(await screen.findByText('Confirma os valores')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nome do alimento'), 'Bolachas');
    await fireEvent.press(screen.getByRole('button', { name: 'por dose' }));
    await fireEvent.changeText(screen.getByLabelText('Tamanho da dose (g)'), '30');
    for (const [l, v] of [['Calorias (kcal)', '120'], ['Proteínas (g)', '6'], ['Gorduras (g)', '3'], ['Hidratos (g)', '15']] as const) await fireEvent.changeText(screen.getByLabelText(l), v);
    expect(await screen.findByText(/400 kcal · P 20 · H 50 · G 10/)).toBeTruthy();       // 120 kcal em 30 g = 400 por 100 g
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar e guardar' }));
    await waitFor(async () => expect((await foods.searchFoods(USER.id, { query: 'Bolachas' }))[0]).toMatchObject({ source: 'label_ocr', servingSize: 30, per100: expect.objectContaining({ kcal: 400 }) }));
  });
  it('objetivos: estimativa identificada como tal e só guarda ao confirmar', async () => {
    await render(<Goals />);
    await fireEvent.press(screen.getByRole('button', { name: 'Calcular estimativa' }));
    expect(await screen.findByText(/ESTIMATIVA/)).toBeTruthy();
    expect(await nut.getGoal(USER.id, today())).toBeNull();                              // calcular não guarda
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar objetivos' }));
    await waitFor(async () => expect((await nut.getGoal(USER.id, today()))!.calories).toBeGreaterThan(1000));
  });
  it('foto de refeição: avisa que são estimativas', async () => {
    await render(<MealPhoto />);
    expect(screen.getByText(/ESTIMATIVAS aproximadas/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'Fotografar e estimar' })).toBeTruthy();
  });
});

describe('Receitas', () => {
  it('criar, listar e calcular por dose', async () => {
    await render(<Recipes />);
    await fireEvent.changeText(screen.getByLabelText('Nova receita'), 'Papas');
    await fireEvent.press(screen.getByRole('button', { name: 'Criar receita' }));
    await waitFor(async () => expect((await recipes.listRecipes(USER.id)).map((r) => r.name)).toEqual(['Papas']));
  });
  it('editor mostra totais e por dose; meal prep regista o lote', async () => {
    const f = await foods.saveFood(USER.id, oats);
    const id = await recipes.createRecipe(USER.id, 'Papas', 2); await recipes.addIngredient(USER.id, id, f.id, 100, 'g');
    setParams({ id });
    await render(<RecipeEditor />);
    expect(await screen.findByText('185 kcal')).toBeTruthy();                            // 370 kcal / 2 doses
    expect(screen.getByText(/Total da receita: 370 kcal/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Registar lote cozinhado' }));
    expect(await screen.findByText(/Doses disponíveis: 4/)).toBeTruthy();
  });
});

describe('Histórico, exportar, sincronização, notificações, perfil, privacidade', () => {
  it('histórico lista o treino concluído', async () => {
    await finishedSession();
    await render(<History />);
    expect(await screen.findByText('Upper — Treino A')).toBeTruthy();
  });
  it('sumário mostra métricas e a ausência de comparação na 1.ª sessão', async () => {
    const { sid } = await finishedSession(); setParams({ id: sid });
    await render(<Summary />);
    expect(await screen.findByText('Treino concluído')).toBeTruthy(); expect(screen.getByText('Volume total')).toBeTruthy(); expect(screen.getByText(/Primeira sessão deste treino/)).toBeTruthy();
  });
  it('exportar: copiar plano para a área de transferência com JSON válido do formato', async () => {
    await finishedSession();
    await render(<ExportScreen />);
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Copiar JSON' }))[0]!);
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());
    const json = JSON.parse((Clipboard.setStringAsync as jest.Mock).mock.calls[0][0]);
    expect(json).toMatchObject({ schemaVersion: '1.0', type: 'workout_plan', name: 'Upper' });
  });
  it('sincronização: mostra estado e botão', async () => {
    await render(<SyncScreen />);
    expect(await screen.findByText('Tudo sincronizado')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy();
  });
  it('notificações: ativar lembrete exige hora válida; guarda preferências', async () => {
    await render(<NotificationsScreen />);
    await fireEvent.press(await screen.findByRole('switch', { name: /Lembrete de treino/ }));
    await fireEvent.changeText(await screen.findByLabelText('Hora (HH:MM)'), '25:99');
    expect(await screen.findByText(/Hora do lembrete de treino inválida/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' }).props.accessibilityState?.disabled).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Hora (HH:MM)'), '7:30');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect((await getPrefs(USER.id)).workout).toEqual({ enabled: true, time: '07:30' }));
  });
  it('perfil: guarda sexo, idade, altura e peso', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Mulher' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar perfil' }));
    await waitFor(async () => expect((await getBodyInfo(USER.id))!.sex).toBe('female'));
  });
  it('privacidade: mostra o rascunho e as secções', async () => {
    await render(<Privacy />);
    expect(screen.getByText(/Rascunho/)).toBeTruthy(); expect(screen.getByText('Quem somos')).toBeTruthy(); expect(screen.getByText('Os teus direitos')).toBeTruthy();
  });
});
