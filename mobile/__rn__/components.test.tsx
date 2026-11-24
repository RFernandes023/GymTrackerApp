import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Button, EmptyState, ScreenHeader, BackLink, Card, AppText } from '../components/ui';
import { Chip, Stepper, Toggle } from '../components/form';

describe('componentes base', () => {
  it('Button chama onPress, mostra rótulo e respeita disabled', async () => {
    const fn = jest.fn(); const { rerender } = await render(<Button label="Guardar" onPress={fn} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' })); expect(fn).toHaveBeenCalledTimes(1);
    await rerender(<Button label="Guardar" onPress={fn} disabled />); await fireEvent.press(screen.getByRole('button', { name: 'Guardar' })); expect(fn).toHaveBeenCalledTimes(1);
  });
  it('ScreenHeader mostra o título e a seta volta atrás', async () => {
    await render(<ScreenHeader title="Planos" />);
    expect(screen.getByText('Planos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' })); expect(router.back).toHaveBeenCalled();
  });
  it('BackLink volta atrás', async () => { await render(<BackLink />); await fireEvent.press(screen.getByText('Voltar')); expect(router.back).toHaveBeenCalled(); });
  it('EmptyState mostra texto e ação', async () => {
    const fn = jest.fn(); await render(<EmptyState title="Sem planos" text="Cria um" action={{ label: 'Criar', onPress: fn }} />);
    expect(screen.getByText('Sem planos')).toBeTruthy(); await fireEvent.press(screen.getByRole('button', { name: 'Criar' })); expect(fn).toHaveBeenCalled();
  });
  it('Card e AppText renderizam', async () => { await render(<Card><AppText>olá</AppText></Card>); expect(screen.getByText('olá')).toBeTruthy(); });
  it('Chip: seleção e toque', async () => {
    const fn = jest.fn(); await render(<Chip label="Peito" selected onPress={fn} />);
    const c = screen.getByRole('button', { name: 'Peito' }); expect(c.props.accessibilityState?.selected).toBe(true); await fireEvent.press(c); expect(fn).toHaveBeenCalled();
  });
  it('Toggle alterna', async () => { const fn = jest.fn(); await render(<Toggle label="Ativo" value={false} onChange={fn} />); await fireEvent.press(screen.getByRole('switch')); expect(fn).toHaveBeenCalledWith(true); });
});

describe('Stepper (peso/repetições)', () => {
  it('+ e − usam o passo configurado (2,5 kg) e respeitam o mínimo', async () => {
    const fn = jest.fn(); await render(<Stepper label="Peso" value={60} step={2.5} onChange={fn} />);
    await fireEvent.press(screen.getByRole('button', { name: /Aumentar/ })); expect(fn).toHaveBeenLastCalledWith(62.5);
    await fireEvent.press(screen.getByRole('button', { name: /Diminuir/ })); expect(fn).toHaveBeenLastCalledWith(57.5);
  });
  it('não desce abaixo de 0', async () => { const fn = jest.fn(); await render(<Stepper label="Peso" value={1} step={2.5} onChange={fn} />); await fireEvent.press(screen.getByRole('button', { name: /Diminuir/ })); expect(fn).toHaveBeenLastCalledWith(0); });
  it('edição manual aceita vírgula decimal e confirma ao sair do campo', async () => {
    const fn = jest.fn(); await render(<Stepper label="Peso" value={60} step={2.5} onChange={fn} />);
    const input = screen.getByDisplayValue('60'); await fireEvent(input, 'focus'); await fireEvent.changeText(input, '62,5'); await fireEvent(input, 'blur');
    expect(fn).toHaveBeenLastCalledWith(62.5);
  });
  it('texto inválido repõe o valor', async () => {
    const fn = jest.fn(); await render(<Stepper label="Peso" value={60} step={2.5} onChange={fn} />);
    const input = screen.getByDisplayValue('60'); await fireEvent(input, 'focus'); await fireEvent.changeText(input, 'abc'); await fireEvent(input, 'blur');
    expect(fn).not.toHaveBeenCalled(); expect(screen.getByDisplayValue('60')).toBeTruthy();
  });
  it('mostra o valor formatado em pt-PT (62,5)', async () => { await render(<Stepper label="Peso" value={62.5} step={2.5} onChange={() => {}} />); expect(screen.getByDisplayValue('62,5')).toBeTruthy(); });
});
