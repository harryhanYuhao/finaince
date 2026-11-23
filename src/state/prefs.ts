import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type ColorConvention = 'greenUp' | 'redUp' | 'mono';
export type UiScale = 'auto' | 'small' | 'normal' | 'large' | 'xlarge';

/** Root font size per interface size; every rem-based size in the app follows it. */
export const UI_SCALE_PX: Record<Exclude<UiScale, 'auto'>, number> = { small: 14, normal: 16, large: 18, xlarge: 20 };

/**
 * `auto`: CSS pixels already account for OS display scaling, but many Linux desktops run a
 * high-resolution monitor at 100% scaling. When the screen is that large in CSS pixels at a
 * device-pixel ratio of 1, enlarge the interface a step or two. Keep in sync with the
 * no-flash script in src/app/layout.tsx.
 */
export function autoRootPx(): number {
  if (typeof window === 'undefined') return 16;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(window.screen.width, window.screen.height);
  if (dpr <= 1.05 && w >= 3200) return 20;
  if (dpr <= 1.05 && w >= 2500) return 18;
  return 16;
}

export function rootPxFor(scale: UiScale): number {
  return scale === 'auto' ? autoRootPx() : UI_SCALE_PX[scale];
}

interface PrefsState {
  theme: ThemePref;
  colorConvention: ColorConvention;
  uiScale: UiScale;
  locale: string;
  setTheme: (t: ThemePref) => void;
  setColorConvention: (c: ColorConvention) => void;
  setUiScale: (s: UiScale) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'system',
      colorConvention: 'greenUp',
      uiScale: 'auto',
      locale: 'en-US',
      setTheme: (theme) => set({ theme }),
      setColorConvention: (colorConvention) => set({ colorConvention }),
      setUiScale: (uiScale) => set({ uiScale }),
    }),
    { name: 'finaince.prefs', version: 1 },
  ),
);
