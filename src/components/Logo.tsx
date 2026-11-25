/** FinAInce mark and word. Plain markup, usable from server and client components. */
export function Logo({ word = true }: { word?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg className="size-[1.125rem]" viewBox="0 0 18 18" aria-hidden>
        <path d="M9 1 17 9 9 17 1 9Z" fill="var(--accent)" />
        <path d="M5 10.5 8 7.5l2 2 3-3" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {word && 'FinAInce'}
    </span>
  );
}
