import axios from 'axios';

import type { BacktestResult, Candle, SymbolCode, Timeframe } from '../types/market';

const client = axios.create({
  baseURL: '/api',
});

export async function fetchSymbols(): Promise<SymbolCode[]> {
  const response = await client.get<SymbolCode[]>('/symbols');

  return response.data;
}

// export async function fetchHistory(symbol: SymbolCode, timeframe: Timeframe): Promise<Candle[]> {
//   const response = await client.get<Candle[]>('/history', {
//     params: { symbol, timeframe },
//   });

//   return response.data;
// }
export async function fetchHistory(
  symbol: SymbolCode,
  timeframe: Timeframe,
  before?: number,
  limit = 300
): Promise<Candle[]> {
  const response = await client.get<Candle[]>('/history', {
    params: { symbol, timeframe, before, limit },
  });

  return response.data;
}

export async function runBacktest(
  symbol: SymbolCode,
  timeframe: Timeframe,
  strategy: string
): Promise<BacktestResult> {
  const response = await client.post<BacktestResult>('/backtest', {
    symbol,
    timeframe,
    strategy,
  });

  return response.data;
}
