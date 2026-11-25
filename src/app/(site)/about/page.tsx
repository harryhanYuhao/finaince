import Link from 'next/link';

export const metadata = { title: 'About — FinAInce' };

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">About FinAInce</h1>
      <div className="mt-4 space-y-4 leading-relaxed text-muted">
        <p>
          FinAInce is a user-friendly quantitative finance tool. Its aim is to make quantitative finance accessible to retail traders: informative
          and easy to use, while delivering clear and rigorous data.
        </p>
        <p>
          The first part is a charting tool. It draws candle and line charts from your own files or from market-data sources, lets you choose the
          interval, accuracy and smoothing, and shows light statistics for the range in view. Annotation, comparisons and custom statistics come
          next.
        </p>
        <p>
          FinAInce focuses on visualisation and light statistics. Pulling data and heavy analysis are handled by dedicated services.
        </p>
      </div>
      <Link href="/chart" className="mt-8 inline-block text-sm font-medium text-accent hover:underline">
        Open charts →
      </Link>
    </main>
  );
}
