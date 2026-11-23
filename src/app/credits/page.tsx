import Link from 'next/link';

export const metadata = { title: 'Credits — FinAInce' };

const LIBS = [
  { name: 'KLineChart', license: 'Apache-2.0', url: 'https://github.com/klinecharts/KLineChart', note: 'Chart rendering' },
  { name: 'Next.js', license: 'MIT', url: 'https://nextjs.org' },
  { name: 'React', license: 'MIT', url: 'https://react.dev' },
  { name: 'Zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: 'Immer', license: 'MIT', url: 'https://immerjs.github.io/immer/' },
  { name: 'Papa Parse', license: 'MIT', url: 'https://www.papaparse.com' },
  { name: 'Comlink', license: 'Apache-2.0', url: 'https://github.com/GoogleChromeLabs/comlink' },
  { name: 'idb-keyval', license: 'Apache-2.0', url: 'https://github.com/jakearchibald/idb-keyval' },
  { name: 'jsPDF', license: 'MIT', url: 'https://github.com/parallax/jsPDF' },
  { name: 'Radix UI', license: 'MIT', url: 'https://www.radix-ui.com' },
  { name: 'Lucide', license: 'ISC', url: 'https://lucide.dev' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://tailwindcss.com' },
];

export default function CreditsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Back to charts
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Credits</h1>
      <p className="mt-2 text-muted">
        FinAInce is built on these open-source projects. Their licence texts ship with the application.
      </p>
      <ul className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface">
        {LIBS.map((l) => (
          <li key={l.name} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <a href={l.url} className="font-medium hover:underline" target="_blank" rel="noreferrer">
              {l.name}
            </a>
            <span className="text-sm text-muted">
              {l.note ? `${l.note} · ` : ''}
              {l.license}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">
        KLineChart is licensed under the Apache License, Version 2.0. Copyright the KLineChart authors.
      </p>
    </main>
  );
}
