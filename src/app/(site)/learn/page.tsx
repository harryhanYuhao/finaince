export const metadata = { title: 'Learn — FinAInce' };

const TOPICS = [
  { title: 'Reading a candlestick', text: 'Open, high, low and close in one shape, and why the colour only compares close with open.' },
  { title: 'Intervals and resampling', text: 'How weekly bars become monthly ones, and why that is approximate.' },
  { title: 'Smoothing without fooling yourself', text: 'Moving averages lag; centred filters use future values. When each is appropriate.' },
  { title: 'Volatility and drawdown', text: 'What the range statistics measure, and what they leave out.' },
];

export default function LearnPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Learn</h1>
      <p className="mt-2 text-muted">Short guides to the ideas behind the charts. They are being written.</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {TOPICS.map((t) => (
          <li key={t.title} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold">{t.title}</h2>
              <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted">Soon</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
