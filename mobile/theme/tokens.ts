export const colors = {
  bg: '#0B0E13',
  surface: '#151A21',
  surfaceAlt: '#212833',
  border: '#262E39',
  text: '#F4F6F8',
  textMuted: '#98A2B0',
  primary: '#55D6A2',
  primaryText: '#04130C',
  accent: '#7BA3FF',
  warning: '#FFB547',
  danger: '#FF7070',
  dangerSoft: '#351B21',
  purple: '#C9A0FF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  stat: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
};
/** Alvo tátil mínimo (botões grandes para uso no ginásio). */
export const MIN_TOUCH = 48;
/** Altura da barra de separadores, sem contar com a área do sistema (somada em runtime). */
export const TAB_BAR_HEIGHT = 64;
