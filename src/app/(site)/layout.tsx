import { SiteFooter, SiteHeader } from '@/site/SiteHeader';

/** Shared frame of the site pages. Chart mode (/chart) is outside this group and has no site bar. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
