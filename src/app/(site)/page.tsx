import Link from 'next/link';
import { BarChart3, CandlestickChart, FileUp, Search, ShieldCheck, Sigma } from 'lucide-react';
import { HomeChart } from '@/site/HomeChart';

const FEATURES = [
  { icon: CandlestickChart, title: 'Candles and lines your way', text: 'Any candle interval from your data, line charts with chosen accuracy and smoothing, and every transformation labelled on the chart.' },
  { icon: Sigma, title: 'Honest statistics', text: 'Change, CAGR, volatility and drawdown for the range in view, computed from complete bars only.' },
  { icon: FileUp, title: 'Your data stays yours', text: 'Drop a CSV or JSON file and chart it in the browser. Nothing is uploaded.' },
  { icon: ShieldCheck, title: 'Clear about the data', text: 'Gaps, incomplete bars, approximate resampling and out-of-date sources are pointed out, not hidden.' },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="text-sm font-medium text-accent">User-friendly quantitative finance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Financial charts that are easy to read and rigorous underneath.</h1>
          <p className="mt-4 text-muted">
            FinAInce makes quantitative finance accessible to retail traders: interactive candle and line charts, light statistics, and clear notes on
            what the data can and cannot tell you.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/chart" className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
              <BarChart3 className="size-[1rem]" /> Open charts
            </Link>
            <Link
              href="/search"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
            >
              <Search className="size-[1rem]" /> Search equities
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted">Soon</span>
            </Link>
          </div>
        </div>
        <HomeChart />
      </section>

      <section aria-label="Features" className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-line bg-surface p-5">
            <f.icon className="size-[1.25rem] text-accent" />
            <h2 className="mt-3 text-sm font-semibold">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
