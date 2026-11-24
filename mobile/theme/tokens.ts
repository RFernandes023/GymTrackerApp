export const colors = {
  bg: '#0D1117',
  surface: '#151C24',
  surfaceAlt: '#202A35',
  border: '#2A3542',
  text: '#F2F5F7',
  textMuted: '#8B95A1',
  primary: '#55D6A2',
  primaryText: '#04130C',
  accent: '#5B8CFF',
  warning: '#FFB020',
  danger: '#FF5C5C',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  stat: { fontSize: 32, fontWeight: '700' as const },
};
/** Alvo tátil mínimo (botões grandes para uso no ginásio). */
export const MIN_TOUCH = 48;
