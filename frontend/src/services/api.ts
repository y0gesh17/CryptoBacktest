import axios from 'axios';

import type { BacktestResult, Candle, SymbolCode, Timeframe } from '../types/market';

const client = axios.create({ baseURL: '/api' });

export async function fetchSymbols(): Promise<SymbolCode[]> {
  const { data } = await client.get<SymbolCode[]>('/symbols');
  return data;
}

export async function fetchHistory(
  symbol: SymbolCode,
  timeframe: Timeframe,
  before?: number,
  limit = 300
): Promise<Candle[]> {
  const { data } = await client.get<Candle[]>('/history', {
    params: { symbol, timeframe, before, limit },
  });
  return data;
}

export async function runBacktest(
  symbol: SymbolCode,
  timeframe: Timeframe,
  strategy: string
): Promise<BacktestResult> {
  const { data } = await client.post<BacktestResult>('/backtest', {
    symbol,
    timeframe,
    strategy,
  });
  return data;
}
