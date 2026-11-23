// Line smoothing (design/04 §3.3). Warm-up and trimmed edges are NaN, never invented values.

export type EdgeMode = 'trim' | 'shrink';

export type SmoothingSpec =
  | { method: 'none' }
  | { method: 'sma'; window: number }
  | { method: 'wma'; window: number }
  | { method: 'ema'; span: number }
  | { method: 'gaussian'; sigma: number; edge: EdgeMode }
  | { method: 'savgol'; window: number; order: 2 | 3 | 4; edge: EdgeMode };

export type SmoothingMethod = SmoothingSpec['method'];

export interface SmootherInfo {
  label: string;
  short: string;
  causal: boolean;
  description: string;
}

export const SMOOTHERS: Record<SmoothingMethod, SmootherInfo> = {
  none: { label: 'None', short: '', causal: true, description: 'The sampled values as they are.' },
  sma: {
    label: 'Simple moving average',
    short: 'SMA',
    causal: true,
    description: 'Average of the last n points. Lags by about n/2 points.',
  },
  ema: {
    label: 'Exponential moving average',
    short: 'EMA',
    causal: true,
    description: 'Weights recent points more (α = 2/(n+1)). Less lag than SMA. Seeded with the SMA of the first n points.',
  },
  wma: {
    label: 'Weighted moving average',
    short: 'WMA',
    causal: true,
    description: 'Linearly weighted average of the last n points (newest weight n).',
  },
  gaussian: {
    label: 'Gaussian kernel',
    short: 'Gauss',
    causal: false,
    description: 'Centred bell-shaped weights (±3σ). Very smooth, but uses future values.',
  },
  savgol: {
    label: 'Savitzky–Golay',
    short: 'S-G',
    causal: false,
    description: 'Fits a local polynomial in a centred window. Keeps peak heights better than an SMA, but uses future values.',
  },
};

/** Number of points (from the start) that have no causal value. */
export function warmup(spec: SmoothingSpec): number {
  switch (spec.method) {
    case 'sma':
    case 'wma':
      return spec.window - 1;
    case 'ema':
      return spec.span - 1;
    default:
      return 0;
  }
}

/** Window length in points, for "≈ n weeks" readouts. */
export function windowPoints(spec: SmoothingSpec): number {
  switch (spec.method) {
    case 'none':
      return 0;
    case 'sma':
    case 'wma':
    case 'savgol':
      return spec.window;
    case 'ema':
      return spec.span;
    case 'gaussian':
      return 2 * Math.ceil(3 * spec.sigma) + 1;
  }
}

export function smooth(x: Float64Array, spec: SmoothingSpec, logSpace = false): Float64Array {
  if (spec.method === 'none') return x;
  const input = logSpace ? x.map((v) => (v > 0 ? Math.log(v) : NaN)) : x;
  let out: Float64Array;
  switch (spec.method) {
    case 'sma':
      out = sma(input, spec.window);
      break;
    case 'wma':
      out = wma(input, spec.window);
      break;
    case 'ema':
      out = ema(input, spec.span);
      break;
    case 'gaussian':
      out = gaussian(input, spec.sigma, spec.edge);
      break;
    case 'savgol':
      out = savgol(input, spec.window, spec.order, spec.edge);
      break;
  }
  return logSpace ? out.map(Math.exp) : out;
}

export function sma(x: Float64Array, n: number): Float64Array {
  const out = new Float64Array(x.length).fill(NaN);
  if (n < 1) return out;
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i];
    if (i >= n) sum -= x[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function wma(x: Float64Array, n: number): Float64Array {
  const out = new Float64Array(x.length).fill(NaN);
  if (n < 1) return out;
  const denom = (n * (n + 1)) / 2;
  let total = 0; // plain sum of the window
  let num = 0; // weighted sum, newest weight n
  for (let i = 0; i < x.length; i++) {
    if (i < n) {
      num += (i + 1) * x[i];
      total += x[i];
      if (i === n - 1) out[i] = num / denom;
    } else {
      num = num + n * x[i] - total;
      total = total + x[i] - x[i - n];
      out[i] = num / denom;
    }
  }
  return out;
}

export function ema(x: Float64Array, span: number): Float64Array {
  const out = new Float64Array(x.length).fill(NaN);
  if (span < 1 || x.length < span) return out;
  const alpha = 2 / (span + 1);
  let seed = 0;
  for (let i = 0; i < span; i++) seed += x[i];
  let prev = seed / span;
  out[span - 1] = prev;
  for (let i = span; i < x.length; i++) {
    prev = alpha * x[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export function gaussian(x: Float64Array, sigma: number, edge: EdgeMode): Float64Array {
  const n = x.length;
  const out = new Float64Array(n).fill(NaN);
  if (sigma <= 0) return x.slice();
  const half = Math.ceil(3 * sigma);
  const w = new Float64Array(2 * half + 1);
  for (let k = -half; k <= half; k++) w[k + half] = Math.exp(-(k * k) / (2 * sigma * sigma));
  for (let i = 0; i < n; i++) {
    if (edge === 'trim' && (i < half || i >= n - half)) continue;
    let sum = 0;
    let wsum = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      sum += w[k + half] * x[j];
      wsum += w[k + half];
    }
    out[i] = sum / wsum;
  }
  return out;
}

/** Least-squares polynomial of degree p through (xs, ys), evaluated at 0. */
function polyFitAtZero(xs: number[], ys: number[], p: number): number {
  const m = p + 1;
  const ata = Array.from({ length: m }, () => new Float64Array(m));
  const aty = new Float64Array(m);
  for (let r = 0; r < xs.length; r++) {
    const pw = new Float64Array(m);
    pw[0] = 1;
    for (let j = 1; j < m; j++) pw[j] = pw[j - 1] * xs[r];
    for (let a = 0; a < m; a++) {
      aty[a] += pw[a] * ys[r];
      for (let b = 0; b < m; b++) ata[a][b] += pw[a] * pw[b];
    }
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(ata[r][col]) > Math.abs(ata[piv][col])) piv = r;
    [ata[col], ata[piv]] = [ata[piv], ata[col]];
    [aty[col], aty[piv]] = [aty[piv], aty[col]];
    const d = ata[col][col];
    if (Math.abs(d) < 1e-12) return NaN;
    for (let r = col + 1; r < m; r++) {
      const f = ata[r][col] / d;
      for (let c = col; c < m; c++) ata[r][c] -= f * ata[col][c];
      aty[r] -= f * aty[col];
    }
  }
  const coef = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = aty[r];
    for (let c = r + 1; c < m; c++) s -= ata[r][c] * coef[c];
    coef[r] = s / ata[r][r];
  }
  return coef[0];
}

export function savgol(x: Float64Array, window: number, order: number, edge: EdgeMode): Float64Array {
  const n = x.length;
  const out = new Float64Array(n).fill(NaN);
  const win = window % 2 === 0 ? window + 1 : window;
  const half = (win - 1) / 2;
  const p = Math.min(order, win - 1);
  // Central convolution coefficients: response of the fit to a unit impulse at each offset.
  const offsets = Array.from({ length: win }, (_, k) => k - half);
  const coeffs = offsets.map((_, k) => polyFitAtZero(offsets, offsets.map((__, j) => (j === k ? 1 : 0)), p));
  for (let i = 0; i < n; i++) {
    if (i >= half && i < n - half) {
      let s = 0;
      for (let k = 0; k < win; k++) s += coeffs[k] * x[i + k - half];
      out[i] = s;
    } else if (edge === 'shrink') {
      const lo = Math.max(0, i - half);
      const hi = Math.min(n - 1, i + half);
      const xs: number[] = [];
      const ys: number[] = [];
      for (let j = lo; j <= hi; j++) {
        xs.push(j - i);
        ys.push(x[j]);
      }
      out[i] = polyFitAtZero(xs, ys, Math.min(p, xs.length - 1));
    }
  }
  return out;
}

/** Short legend label, e.g. "EMA 20". */
export function smoothingLabel(spec: SmoothingSpec): string {
  switch (spec.method) {
    case 'none':
      return '';
    case 'sma':
    case 'wma':
      return `${SMOOTHERS[spec.method].short} ${spec.window}`;
    case 'ema':
      return `EMA ${spec.span}`;
    case 'gaussian':
      return `Gauss σ${spec.sigma}`;
    case 'savgol':
      return `S-G ${spec.window}/${spec.order}`;
  }
}
