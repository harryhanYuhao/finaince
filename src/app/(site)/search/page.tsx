import Link from 'next/link';
import { Search } from 'lucide-react';

export const metadata = { title: 'Equity search — FinAInce' };

/** Placeholder: search arrives with the market-data sources (design/07, stage 2). */
export default function SearchPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Equity search</h1>
      <p className="mt-2 text-muted">Find a stock, ETF or index and open its chart. This is coming soon.</p>
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 opacity-60">
        <Search className="size-[1rem] text-muted" />
        <input disabled aria-label="Search equities (coming soon)" placeholder="Search by ticker or name, e.g. AAPL" className="h-11 flex-1 bg-transparent text-sm outline-none" />
      </div>
      <p className="mt-4 text-sm text-muted">
        Meanwhile you can chart your own files in{' '}
        <Link href="/chart" className="font-medium text-accent hover:underline">
          chart mode
        </Link>
        .
      </p>
    </main>
  );
}
