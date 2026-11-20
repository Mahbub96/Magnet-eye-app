/** Design tokens read from the Figma file "Magnet Eye – App UI" (dark, one accent, N/S in red/blue).
 * Font: Inter, bundled in four weights (400, 500, 600, 700) as one Android font family, so
 * `fontWeight` picks the face. Use `Text` from `./Text`, which sets it. */
export const font = 'Inter';

export const color = {
  bg: '#0E1116',
  surface: '#161A21',
  surface2: '#1E232C',
  border: '#2A303B',
  text: '#ECEFF4',
  textDim: '#8B94A5',
  textFaint: '#5C6575',
  accent: '#7C9CFF',
  accentText: '#0E1116',
  good: '#3DD68C',
  warn: '#F5B544',
  bad: '#FF6B6B',
  north: '#FF6B6B',
  south: '#4DA3FF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontSize: 26, fontWeight: '700' as const, color: color.text, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const, color: color.text },
  body: { fontSize: 14, color: color.textDim, lineHeight: 20 },
  label: { fontSize: 11, fontWeight: '600' as const, color: color.accent, letterSpacing: 0.8 },
  small: { fontSize: 12, color: color.textDim },
  value: { fontSize: 22, fontWeight: '600' as const, color: color.text },
  mono: { fontFamily: 'monospace', fontSize: 12, color: color.textDim },
};
