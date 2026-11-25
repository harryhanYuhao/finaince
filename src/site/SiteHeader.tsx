'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cx } from '@/components/ui';
import { UserSettingsButton } from '@/features/settings/UserSettings';
import { useRootPx, useThemeName } from '@/features/workspace/hooks';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/search', label: 'Equity search' },
  { href: '/learn', label: 'Learn' },
];

/** Top bar of the site pages (home, about, search, learn). Chart mode has its own bar. */
export function SiteHeader() {
  useThemeName();
  useRootPx();
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" aria-label="FinAInce home" className="mr-2 rounded-md hover:opacity-80">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          href="/chart"
          className="hidden h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:opacity-90 sm:inline-flex"
        >
          <CandlestickChart className="size-[0.9375rem]" /> Open charts
        </Link>
        <UserSettingsButton />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6 text-xs text-muted sm:px-6">
        <span>© {new Date().getFullYear()} FinAInce</span>
        <span>Charts and statistics for information only, not investment advice.</span>
        <div className="flex-1" />
        <Link href="/credits" className="hover:text-ink">
          Credits
        </Link>
      </div>
    </footer>
  );
}
