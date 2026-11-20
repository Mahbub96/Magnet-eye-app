/** Design tokens from the Figma file "Magnet Eye – App UI" (dark, one accent, N/S in red/blue). */
export const color = {
  bg: '#0E1013',
  surface: '#161A20',
  surface2: '#1D222A',
  border: '#262C36',
  text: '#ECEEF2',
  textDim: '#8B93A1',
  textFaint: '#5D6573',
  accent: '#7C95FF',
  accentText: '#0E1013',
  good: '#3DD68C',
  warn: '#F2B541',
  bad: '#FF5C5C',
  north: '#FF5C5C',
  south: '#5B8CFF',
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
