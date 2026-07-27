import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import csv from 'csv-parser';

import type { Candle, SymbolCode, Timeframe } from '../types/market.js';

const symbols: SymbolCode[] = ['BTCUSDT', 'ETHUSDT'];
const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '../../data');
const workspaceRoot = path.resolve(__dirname, '../../../..');

const externalDataFiles: Partial<Record<SymbolCode, Partial<Record<Timeframe, string>>>> = {
  ETHUSDT: {
    '15m': path.join(workspaceRoot, 'Eth ', 'BYBIT_ETHUSDT_15m.csv'),
    '1h': path.join(workspaceRoot, 'Eth ', 'BYBIT_ETHUSDT_1h.csv'),
    '4h': path.join(workspaceRoot, 'Eth ', 'BYBIT_ETHUSDT_4h.csv'),
  },
};

const timeframeSeconds: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export function getSymbols(): SymbolCode[] {
  return symbols;
}

export function getTimeframes(): Timeframe[] {
  return timeframes;
}

export async function getHistory(symbol: string, timeframe: string): Promise<Candle[]> {
  assertSymbol(symbol);
  assertTimeframe(timeframe);

  const csvPath = getCsvPath(symbol, timeframe);

  if (fs.existsSync(csvPath)) {
    return readCandlesFromCsv(csvPath);
  }

  return generateFallbackCandles(symbol as SymbolCode, timeframe as Timeframe);
}

function getCsvPath(symbol: SymbolCode, timeframe: Timeframe): string {
  return externalDataFiles[symbol]?.[timeframe] ?? path.join(dataRoot, symbol, `${timeframe}.csv`);
}

function assertSymbol(symbol: string): asserts symbol is SymbolCode {
  if (!symbols.includes(symbol as SymbolCode)) {
    throw new Error(`Unsupported symbol: ${symbol}`);
  }
}

function assertTimeframe(timeframe: string): asserts timeframe is Timeframe {
  if (!timeframes.includes(timeframe as Timeframe)) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }
}

function readCandlesFromCsv(csvPath: string): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    const candles: Candle[] = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row: Record<string, string>) => {
        const normalizedRow = normalizeRow(row);

        candles.push({
          time: parseTime(normalizedRow.time),
          open: Number(normalizedRow.open),
          high: Number(normalizedRow.high),
          low: Number(normalizedRow.low),
          close: Number(normalizedRow.close),
          volume: Number(normalizedRow.volume),
        });
      })
      .on('end', () => resolve(candles.filter(isValidCandle)))
      .on('error', reject);
  });
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const entries = Object.entries(row).map(([key, value]) => [
    key.trim().toLowerCase() === 'datetime' ? 'time' : key.trim().toLowerCase(),
    value,
  ]);

  return Object.fromEntries(entries);
}

function parseTime(value: string): number {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return numericValue > 10_000_000_000 ? Math.floor(numericValue / 1000) : numericValue;
  }

  return Math.floor(new Date(`${value.trim()}Z`).getTime() / 1000);
}

function isValidCandle(candle: Candle): boolean {
  return Object.values(candle).every(Number.isFinite);
}

function generateFallbackCandles(symbol: SymbolCode, timeframe: Timeframe): Candle[] {
  const candles: Candle[] = [];
  const step = timeframeSeconds[timeframe];
  const startTime = 1_704_067_200;
  let price = symbol === 'BTCUSDT' ? 43500 : 2250;

  for (let index = 0; index < 180; index += 1) {
    const wave = Math.sin(index / 7) * (symbol === 'BTCUSDT' ? 420 : 34);
    const drift = index * (symbol === 'BTCUSDT' ? 18 : 1.2);
    const open = price;
    const close = price + wave * 0.18 + drift * 0.015 + Math.cos(index / 4) * (symbol === 'BTCUSDT' ? 90 : 8);
    const high = Math.max(open, close) + (symbol === 'BTCUSDT' ? 180 : 16);
    const low = Math.min(open, close) - (symbol === 'BTCUSDT' ? 160 : 14);

    candles.push({
      time: startTime + index * step,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(1000 + index * 8 + Math.abs(wave)),
    });

    price = close;
  }

  return candles;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
