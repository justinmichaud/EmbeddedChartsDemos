import { Platform } from 'react-native';

// Palette ported verbatim from JSChartsFast's Tailwind hex classes.
export const C = {
  bg: '#0f1419',
  panel: '#1a1f29',
  border: '#2d3748',
  borderHover: '#4b5563',
  text: '#e6e8eb',
  textDim: '#9ca3af',
  textMuted: '#6b7280',
  blue: '#3b82f6',
  blueDim: '#1e3a5f',
  green: '#10b981',
  greenBright: '#4ade80',
  red: '#ef4444',
  amber: '#facc15',
  orange: '#f97316',
  grid: '#2d3748',
  sweep: 'rgba(99,179,237,0.55)',
  sweepTint: 'rgba(59,130,246,0.07)',
} as const;

// Monospace family, matching the `font-mono` look of the original.
export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
