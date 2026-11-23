// Time parsing (design/03 §3.2). Ambiguous locale formats are never guessed.

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_FULL = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

export type TimeKind = 'iso' | 'iso-local' | 'date' | 'epoch-s' | 'epoch-ms' | 'unknown';

export function classifyTime(sample: string): TimeKind {
  const s = sample.trim();
  if (ISO_DATE_ONLY.test(s)) return 'date';
  if (ISO_FULL.test(s)) return /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? 'iso' : 'iso-local';
  if (NUMERIC.test(s)) {
    const n = Number(s);
    // Seconds since epoch stay below 1e11 until the year 5138; milliseconds are above it after 1973.
    return Math.abs(n) < 1e11 ? 'epoch-s' : 'epoch-ms';
  }
  return 'unknown';
}

/**
 * Parse a time cell to epoch ms. `date` and `iso-local` values are interpreted as UTC here and
 * corrected to the session zone by the caller once the session is known.
 */
export function parseTimeCell(raw: string, kind: TimeKind): number {
  const s = raw.trim();
  switch (kind) {
    case 'iso':
      return Date.parse(s.replace(' ', 'T'));
    case 'iso-local':
      return Date.parse(s.replace(' ', 'T') + 'Z');
    case 'date': {
      const m = ISO_DATE_ONLY.exec(s);
      return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
    }
    case 'epoch-s':
      return Number(s) * 1000;
    case 'epoch-ms':
      return Number(s);
    default:
      return NaN;
  }
}

export function parseBool(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return null;
}

export function parseNumber(raw: string | undefined): number {
  if (raw === undefined) return NaN;
  const s = raw.trim().replace(/^"|"$/g, '').replace(/,/g, '');
  if (s === '') return NaN;
  return Number(s);
}
