import next from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...next,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  {
    // Server Components in src/app must not pull in client-only layers (02 §2).
    files: ['src/app/**/*.{ts,tsx}'],
    ignores: ['src/app/WorkspaceLoader.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@/features/*', '@/state/*', '@/render/*', '@/workers/*', 'klinecharts'] },
      ],
    },
  },
];

export default config;
