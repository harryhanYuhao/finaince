import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'FinAInce — Charts',
  description: 'User-friendly, rigorous financial charts for retail traders.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1115' },
  ],
};

// Applies the saved theme and interface size before first paint (no flash or jump).
// Keep the size logic in sync with autoRootPx() in src/state/prefs.ts.
const themeScript = `(() => { try {
  const p = JSON.parse(localStorage.getItem('finaince.prefs') || '{}').state || {};
  const t = p.theme || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  const sizes = { small: 14, normal: 16, large: 18, xlarge: 20 };
  let px = sizes[p.uiScale];
  if (!px) {
    const w = Math.max(screen.width, screen.height), dpr = devicePixelRatio || 1;
    px = dpr <= 1.05 && w >= 3200 ? 20 : dpr <= 1.05 && w >= 2500 ? 18 : 16;
  }
  document.documentElement.style.fontSize = px + 'px';
} catch {} })();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
