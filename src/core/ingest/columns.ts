// Column sniffing for tabular inputs (design/03 §3.1).

export type ColumnRole = 'time' | 'open' | 'high' | 'low' | 'close' | 'volume' | 'tradingDay' | 'marketOpen' | 'complete' | 'ignore';

export interface ColumnMapping {
  /** Column index per role (only roles present). */
  time: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  tradingDay?: number;
  marketOpen?: number;
  complete?: number;
  volumeKind: 'tick' | 'traded' | 'none';
}

const ALIASES: Record<Exclude<ColumnRole, 'ignore'>, string[]> = {
  time: ['time', 'timeutc', 'date', 'datetime', 'timestamp', 't', 'opentime', 'bartime', 'dateutc', 'timeopen'],
  open: ['open', 'o', 'opening', 'openprice', 'priceopen'],
  high: ['high', 'h', 'highprice', 'pricehigh', 'max'],
  low: ['low', 'l', 'lowprice', 'pricelow', 'min'],
  close: ['close', 'c', 'closing', 'closeprice', 'priceclose', 'last', 'price', 'value', 'adjclose', 'nav', 'level'],
  volume: ['volume', 'vol', 'v', 'tickvolume', 'tickvol', 'qty', 'quantity'],
  tradingDay: ['istradingday', 'tradingday'],
  marketOpen: ['marketopen', 'ismarketopen'],
  complete: ['iscompletebar', 'complete', 'iscomplete', 'barcomplete'],
};

export function normaliseHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.()]/g, '');
}

export interface SniffResult {
  confidence: number;
  mapping: ColumnMapping | null;
  roles: ColumnRole[];
}

export function sniffColumns(header: string[]): SniffResult {
  const roles: ColumnRole[] = header.map(() => 'ignore');
  const found: Partial<Record<ColumnRole, number>> = {};
  const norm = header.map(normaliseHeader);

  // Exact alias pass first, in a fixed role order so "close" wins over "price"/"value" duplicates.
  const order: Exclude<ColumnRole, 'ignore'>[] = ['time', 'open', 'high', 'low', 'close', 'volume', 'tradingDay', 'marketOpen', 'complete'];
  for (const role of order) {
    for (const alias of ALIASES[role]) {
      const idx = norm.findIndex((n, i) => n === alias && roles[i] === 'ignore');
      if (idx >= 0 && found[role] === undefined) {
        found[role] = idx;
        roles[idx] = role;
        break;
      }
    }
  }

  if (found.time === undefined || found.close === undefined) {
    return { confidence: found.time !== undefined || found.close !== undefined ? 0.3 : 0, mapping: null, roles };
  }
  const hasOhlc = found.open !== undefined && found.high !== undefined && found.low !== undefined;
  const volumeHeader = found.volume !== undefined ? norm[found.volume] : '';
  const mapping: ColumnMapping = {
    time: found.time,
    close: found.close,
    ...(hasOhlc ? { open: found.open, high: found.high, low: found.low } : {}),
    ...(found.volume !== undefined ? { volume: found.volume } : {}),
    ...(found.tradingDay !== undefined ? { tradingDay: found.tradingDay } : {}),
    ...(found.marketOpen !== undefined ? { marketOpen: found.marketOpen } : {}),
    ...(found.complete !== undefined ? { complete: found.complete } : {}),
    volumeKind: found.volume === undefined ? 'none' : volumeHeader.includes('tick') ? 'tick' : 'traded',
  };
  return { confidence: hasOhlc ? 1 : 0.9, mapping, roles };
}

export function mappingFromRoles(roles: ColumnRole[], volumeKind: ColumnMapping['volumeKind']): ColumnMapping | null {
  const idx = (r: ColumnRole) => {
    const i = roles.indexOf(r);
    return i >= 0 ? i : undefined;
  };
  const time = idx('time');
  const close = idx('close');
  if (time === undefined || close === undefined) return null;
  const open = idx('open');
  const high = idx('high');
  const low = idx('low');
  const volume = idx('volume');
  const hasOhlc = open !== undefined && high !== undefined && low !== undefined;
  return {
    time,
    close,
    ...(hasOhlc ? { open, high, low } : {}),
    ...(volume !== undefined ? { volume } : {}),
    ...(idx('tradingDay') !== undefined ? { tradingDay: idx('tradingDay') } : {}),
    ...(idx('marketOpen') !== undefined ? { marketOpen: idx('marketOpen') } : {}),
    ...(idx('complete') !== undefined ? { complete: idx('complete') } : {}),
    volumeKind: volume === undefined ? 'none' : volumeKind === 'none' ? 'traded' : volumeKind,
  };
}
