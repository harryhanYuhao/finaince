// Design tokens shared by the UI (CSS variables in globals.css) and the chart (design/06 §4).

import type { ColorConvention } from '@/state/prefs';

export type ThemeName = 'light' | 'dark';

export interface ChartTheme {
  name: ThemeName;
  bg: string;
  surface: string;
  grid: string;
  text: string;
  textMuted: string;
  border: string;
  up: string;
  down: string;
  neutral: string;
  accent: string;
  accentSoft: string;
  ghost: string;
  gap: string;
  font: string;
  /** Interface scale (root font size / 16); chart text and strokes follow it. */
  scale: number;
}

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const BASE: Record<ThemeName, Omit<ChartTheme, 'up' | 'down' | 'scale'>> = {
  light: {
    name: 'light',
    bg: '#FBFAF7',
    surface: '#FFFFFF',
    grid: '#ECE9E2',
    text: '#1B1D22',
    textMuted: '#6B6F78',
    border: '#E3DFD6',
    neutral: '#8B8F98',
    accent: '#3D5AFE',
    accentSoft: 'rgba(61, 90, 254, 0.14)',
    ghost: 'rgba(107, 111, 120, 0.45)',
    gap: '#B8892B',
    font: FONT,
  },
  dark: {
    name: 'dark',
    bg: '#0F1115',
    surface: '#161A21',
    grid: '#222833',
    text: '#E6E8EC',
    textMuted: '#8B919C',
    border: '#2A303B',
    neutral: '#7A808B',
    accent: '#7C8CFF',
    accentSoft: 'rgba(124, 140, 255, 0.18)',
    ghost: 'rgba(139, 145, 156, 0.5)',
    gap: '#D9A441',
    font: FONT,
  },
};

const UP_DOWN: Record<ThemeName, { jade: string; vermilion: string; mono: [string, string] }> = {
  light: { jade: '#1E9E72', vermilion: '#D9534A', mono: ['#1B1D22', '#8B8F98'] },
  dark: { jade: '#33C08E', vermilion: '#F0665C', mono: ['#E6E8EC', '#7A808B'] },
};

export function chartTheme(name: ThemeName, convention: ColorConvention, scale = 1): ChartTheme {
  const c = UP_DOWN[name];
  const [up, down] =
    convention === 'greenUp' ? [c.jade, c.vermilion] : convention === 'redUp' ? [c.vermilion, c.jade] : c.mono;
  return { ...BASE[name], up, down, scale };
}

/** `#RRGGBB` → `rgba(r,g,b,a)`. */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
