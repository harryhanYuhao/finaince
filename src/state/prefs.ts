import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type ColorConvention = 'greenUp' | 'redUp' | 'mono';

interface PrefsState {
  theme: ThemePref;
  colorConvention: ColorConvention;
  locale: string;
  setTheme: (t: ThemePref) => void;
  setColorConvention: (c: ColorConvention) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'system',
      colorConvention: 'greenUp',
      locale: 'en-US',
      setTheme: (theme) => set({ theme }),
      setColorConvention: (colorConvention) => set({ colorConvention }),
    }),
    { name: 'finaince.prefs', version: 1 },
  ),
);
