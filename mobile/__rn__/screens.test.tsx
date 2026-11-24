import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { device, routerMock, setParams, USER } from './harness';
import { searchExercises } from '../features/workouts/exercisesRepo';
import * as plans from '../features/workouts/plansRepo';
import * as sessions from '../features/workouts/sessionsRepo';
import { saveBasics } from '../features/profile/profileRepo';

import Dashboard from '../app/(tabs)/index';
import WorkoutHome from '../app/(tabs)/workout';
import Preview from '../app/workout/preview';
import Active from '../app/workout/active';
import Login from '../app/login';

beforeEach(async () => { await device(); jest.clearAllMocks(); setParams({}); });

async function seedPlan() {
  await saveBasics(USER.id, { sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
  const planId = await plans.createPlan(USER.id, 'Upper Body');
  const dayId = (await plans.getPlan(planId))!.days[0]!.id;
  await plans.updateDay(planId, dayId, { name: 'Upper A' });
  const ex = async (q: string) => (await searchExercises(USER.id, { query: q }))[0]!.id;
  await plans.addExerciseToDay(planId, dayId, await ex('Supino plano com barra'), { weight: 60, sets: 3, repMin: 8, repMax: 12 });
  await plans.addExerciseToDay(planId, dayId, await ex('Remada curvada com barra'), { weight: 50, sets: 2 });
  return { planId, dayId };
}

describe('Login', () => {
  it('o botão Google só fica ativo depois de aceitar o tratamento de dados', async () => {
    await render(<Login />);
    const btn = () => screen.getByRole('button', { name: 'Continuar com Google' });
    expect(btn().props.accessibilityState?.disabled ?? btn().props.disabled).toBeTruthy();
    await fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(btn().props.accessibilityState?.disabled).toBeFalsy());
  });
});

describe('Dashboard', () => {
  it('mostra o nome do utilizador e os cartões por defeito; editar mostra controlos', async () => {
    await render(<Dashboard />);
    expect(await screen.findByText('Ana')).toBeTruthy();
    expect(await screen.findByText('Calorias consumidas')).toBeTruthy();
    expect(screen.getByText('Próximo treino')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Editar dashboard' }));
    expect(await screen.findByRole('button', { name: 'Remover Próximo treino' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adicionar cartões' })).toBeTruthy();
  });
  it('remover um cartão e voltar a adicioná-lo pelo seletor', async () => {
    await render(<Dashboard />);
    await screen.findByText('Peso atual');
    await fireEvent.press(screen.getByRole('button', { name: 'Editar dashboard' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remover Peso atual' }));
    await waitFor(() => expect(screen.queryByText('Peso atual')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar cartões' }));
    await fireEvent.press(await screen.findByText('Peso atual'));
    await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.getByText('Peso atual')).toBeTruthy());
  });
  it('cartão do próximo treino mostra o dia do plano', async () => {
    await seedPlan(); await render(<Dashboard />);
    expect(await screen.findByText('Upper A')).toBeTruthy();
  });
});

describe('Treino: lista → pré-visualização → treino ativo', () => {
  it('tocar num treino abre a pré-visualização e NÃO inicia o treino', async () => {
    const { planId, dayId } = await seedPlan();
    await render(<WorkoutHome />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Upper A · 2 ex.' }));
    expect(routerMock().push).toHaveBeenCalledWith({ pathname: '/workout/preview', params: { planId, dayId } });
    expect(await sessions.getActiveSessionId(USER.id)).toBeNull();
  });
  it('pré-visualização mostra exercícios, cargas e o botão Iniciar treino', async () => {
    const { planId, dayId } = await seedPlan(); setParams({ planId, dayId });
    await render(<Preview />);
    expect(await screen.findByText('Upper A')).toBeTruthy();
    expect(screen.getByText('Supino plano com barra')).toBeTruthy();
    expect(screen.getByText('Remada curvada com barra')).toBeTruthy();
    expect(await screen.findAllByText(/60 kg/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar treino' }));
    await waitFor(() => expect(routerMock().replace).toHaveBeenCalledWith('/workout/active'));
    expect(await sessions.getActiveSessionId(USER.id)).not.toBeNull();
  });
  it('treino ativo: concluir série guarda, mostra descanso e progresso; saltar descanso', async () => {
    const { planId, dayId } = await seedPlan();
    await sessions.startSession(USER.id, planId, dayId);
    await render(<Active />);
    expect(await screen.findByText('Supino plano com barra')).toBeTruthy();
    expect(await screen.findByText('0 de 5 séries concluídas')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Concluir série' }));
    expect(await screen.findByText('1 de 5 séries concluídas')).toBeTruthy();
    expect(await screen.findByRole('timer')).toBeTruthy();                         // anel do descanso
    await fireEvent.press(screen.getByRole('button', { name: 'Saltar' }));
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    const s = (await sessions.getSession((await sessions.getActiveSessionId(USER.id))!))!;
    expect(s.exercises[0]!.sets[0]!.completed).toBe(true);
  });
  it('treino ativo: + aumenta o peso com o incremento do exercício (2,5 kg)', async () => {
    const { planId, dayId } = await seedPlan();
    const id = await sessions.startSession(USER.id, planId, dayId);
    await render(<Active />);
    await fireEvent.press(await screen.findByLabelText('Aumentar Peso (kg)'));
    await waitFor(async () => expect((await sessions.getSession(id))!.exercises[0]!.sets[0]!.weight).toBe(62.5));
  });
});
