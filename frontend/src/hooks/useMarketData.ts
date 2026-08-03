import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchHistory, fetchSymbols } from '../services/api';
import type { Candle, SymbolCode, Timeframe } from '../types/market';

/**
 * Loads symbols + candle history for the selected market.
 * `revision` bumps only on a fresh market load (not when older bars prepend).
 */
export function useMarketData(symbol: SymbolCode, timeframe: Timeframe) {
  const [symbols, setSymbols] = useState<SymbolCode[]>(['BTCUSDT', 'ETHUSDT']);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [revision, setRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready');

  const candlesRef = useRef<Candle[]>([]);
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    fetchSymbols()
      .then(setSymbols)
      .catch(() => setStatus('Could not load symbols. Is the backend running?'));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setStatus('Loading candles...');
    hasMoreRef.current = true;

    fetchHistory(symbol, timeframe)
      .then((next) => {
        candlesRef.current = next;
        setCandles(next);
        setRevision((value) => value + 1);
        setStatus(`Loaded ${next.length} candles`);
      })
      .catch(() => setStatus('Could not load candles. Start the backend on port 4100.'))
      .finally(() => setIsLoading(false));
  }, [symbol, timeframe]);

  const loadOlderCandles = useCallback(async (): Promise<number> => {
    const current = candlesRef.current;
    if (loadingOlderRef.current || !hasMoreRef.current || current.length === 0) return 0;

    loadingOlderRef.current = true;
    try {
      const older = await fetchHistory(symbol, timeframe, current[0].time);
      const existing = new Set(current.map((c) => c.time));
      const unique = older.filter((c) => !existing.has(c.time));

      if (unique.length === 0) {
        hasMoreRef.current = false;
        return 0;
      }

      const next = [...unique, ...current];
      candlesRef.current = next;
      setCandles(next);
      setStatus(`Loaded ${unique.length} older candles`);
      return unique.length;
    } catch {
      setStatus('Could not load older candles.');
      return 0;
    } finally {
      loadingOlderRef.current = false;
    }
  }, [symbol, timeframe]);

  return {
    symbols,
    candles,
    revision,
    isLoading,
    status,
    setStatus,
    setIsLoading,
    loadOlderCandles,
  };
}
