import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEC, type ChartSpec } from '@/core/model/spec';
import {
  HANDOFF_TTL_MS,
  dataLabel,
  decodeHandoff,
  encodeHandoff,
  newWorkspace,
  normaliseSpec,
  parseWorkspace,
  refFromOrigin,
  sameData,
} from '@/core/model/workspace';
import { useWorkspace } from '@/state/workspace';

const massive = { kind: 'massive' as const, ticker: 'SPY', multiplier: 1, timespan: 'day' as const, years: 5 };

describe('workspace documents', () => {
  it('round-trips through JSON', () => {
    const doc = newWorkspace('Mine', { ...DEFAULT_SPEC, chartType: 'line', data: massive }, 1000);
    const r = parseWorkspace(JSON.parse(JSON.stringify(doc)));
    expect(r).toEqual({ ok: true, doc, upgraded: false });
  });

  it('upgrades the pre-workspace localStorage value', () => {
    const legacy = { state: { spec: { ...DEFAULT_SPEC, data: undefined, scale: 'log', timeFrame: { preset: '5Y' } } }, version: 1 };
    const r = parseWorkspace(legacy);
    expect(r.ok && r.upgraded).toBe(true);
    if (r.ok) {
      expect(r.doc.charts).toHaveLength(1);
      expect(r.doc.charts[0].spec).toMatchObject({ scale: 'log', timeFrame: { preset: '5Y' }, data: null });
      expect(r.doc.name).toBe('Untitled workspace');
    }
  });

  it('fills defaults, drops bad values and keeps good ones', () => {
    const spec = normaliseSpec({
      chartType: 'pie',
      scale: 'percent',
      timeFrame: { from: 1, to: 2 },
      line: { width: 3 },
      data: { kind: 'massive', ticker: 'AAPL' },
      extra: 'ignored',
    });
    expect(spec.chartType).toBe('candle');
    expect(spec.scale).toBe('percent');
    expect(spec.timeFrame).toEqual(DEFAULT_SPEC.timeFrame);
    expect(spec.line).toEqual({ ...DEFAULT_SPEC.line, width: 3 });
    expect(spec.data).toBeNull();
    expect('extra' in spec).toBe(false);
    expect(normaliseSpec({ timeFrame: { start: { year: 2020, day: 4 }, span: { count: 6, unit: 'month' } } }).timeFrame).toEqual({
      start: { year: 2020 },
      span: { count: 6, unit: 'month' },
    });
  });

  it('refuses files from a newer version and non-workspaces', () => {
    expect(parseWorkspace({ format: 'finaince.workspace', version: 2 })).toMatchObject({ ok: false, reason: expect.stringMatching(/newer version/) });
    expect(parseWorkspace({ hello: 1 }).ok).toBe(false);
    expect(parseWorkspace('nope').ok).toBe(false);
  });

  it('repairs a document with no charts or a bad active chart', () => {
    const r = parseWorkspace({ format: 'finaince.workspace', version: 1, id: 'w-1', name: '  ', charts: [], activeChartId: 'x' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.charts).toHaveLength(1);
      expect(r.doc.activeChartId).toBe(r.doc.charts[0].id);
      expect(r.doc.name).toBe('Untitled workspace');
    }
  });
});

describe('data references', () => {
  it('come from a dataset origin', () => {
    expect(refFromOrigin({ kind: 'file', name: 'a.csv', size: 1 }, 'ds1')).toEqual({ kind: 'local', datasetId: 'ds1', label: 'a.csv' });
    expect(refFromOrigin({ kind: 'url', url: '/samples/x.csv' }, 'ds2')).toEqual({ kind: 'sample', sample: 'us500' });
    expect(refFromOrigin({ kind: 'massive', ticker: 'SPY', multiplier: 1, timespan: 'day', fetchedAt: 0, years: 10 }, 'ds3')).toEqual({ ...massive, years: 10 });
  });

  it('compare by identity, not by history length', () => {
    expect(sameData(massive, { ...massive, years: 20 })).toBe(true);
    expect(sameData(massive, { ...massive, timespan: 'week' })).toBe(false);
    expect(sameData({ kind: 'sample', sample: 'us500' }, { kind: 'sample', sample: 'us500' })).toBe(true);
    expect(sameData(null, null)).toBe(false);
    expect(dataLabel(massive)).toBe('SPY · Massive');
  });
});

describe('hand-off between pages', () => {
  it('is valid for a minute only', () => {
    const raw = encodeHandoff({ data: { kind: 'sample', sample: 'us500' }, range: '6M', chartType: 'candle' }, 1_000_000);
    expect(decodeHandoff(raw, 1_000_000 + 1000)).toEqual({ data: { kind: 'sample', sample: 'us500' }, range: '6M', chartType: 'candle', name: undefined });
    expect(decodeHandoff(raw, 1_000_000 + HANDOFF_TTL_MS + 1)).toBeNull();
    expect(decodeHandoff('{bad', 0)).toBeNull();
    expect(decodeHandoff(JSON.stringify({ at: 5, data: { kind: 'evil' } }), 6)).toBeNull();
  });
});

describe('workspace store', () => {
  const spec = (patch: Partial<ChartSpec>): ChartSpec => ({ ...DEFAULT_SPEC, ...patch });

  it('opens with a fresh history and binds data without an undo step', () => {
    const ws = useWorkspace.getState();
    ws.open({ id: 'w', name: 'W', createdAt: 0, chartId: 'c', saved: true }, spec({ data: massive }));
    useWorkspace.getState().update((s) => void (s.scale = 'log'));
    useWorkspace.getState().bind('ds-spy');
    const s = useWorkspace.getState();
    expect(s.spec.datasetId).toBe('ds-spy');
    expect(s.past).toHaveLength(1);
    expect(s.past[0].datasetId).toBe('ds-spy'); // same data reference → same binding
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().spec).toMatchObject({ scale: 'linear', datasetId: 'ds-spy' });
  });

  it('does not rebind history entries that used other data', () => {
    const ws = useWorkspace.getState();
    ws.open({ id: 'w', name: 'W', createdAt: 0, chartId: 'c', saved: true }, spec({ data: { kind: 'sample', sample: 'us500' }, datasetId: 'ds-sample' }));
    useWorkspace.getState().update((s) => {
      s.data = massive;
      s.datasetId = 'ds-spy';
    });
    useWorkspace.getState().bind('ds-spy-2');
    expect(useWorkspace.getState().past[0].datasetId).toBe('ds-sample');
  });
});
