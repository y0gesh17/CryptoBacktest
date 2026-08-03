import { useEffect, useState } from 'react';

import { runBacktest as runBacktestApi } from '../services/api';
import type { BacktestResult, SymbolCode, Timeframe } from '../types/market';
import { getErrorMessage } from '../utils/format';

/**
 * Runs the backend backtest and holds the latest result.
 */
export function useBacktest(
  symbol: SymbolCode,
  timeframe: Timeframe,
  strategy: string,
  onStatus: (message: string) => void,
  setIsLoading: (loading: boolean) => void
) {
  const [result, setResult] = useState<BacktestResult | null>(null);

  useEffect(() => {
    setResult(null);
  }, [symbol, timeframe]);

  const run = async () => {
    setIsLoading(true);
    onStatus('Running backtest...');

    try {
      const next = await runBacktestApi(symbol, timeframe, strategy);
      setResult(next);
      onStatus(`Backtest complete: ${next.trades.length} trades`);
    } catch (error) {
      onStatus(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return { result, run };
}
