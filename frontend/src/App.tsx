import { useEffect, useState } from 'react';

import { ChartPanel } from './components/ChartPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { StrategyEditor } from './components/StrategyEditor';
import { fetchHistory, fetchSymbols, runBacktest } from './services/api';
import type { BacktestResult, Candle, SymbolCode, Timeframe } from './types/market';

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const defaultStrategy = `/*
Strategy sandbox notes:
- This code runs once for every candle from oldest to newest.
- Do not import packages, fetch data, use DOM APIs, or use async code.
- Use only the variables/functions listed below.

Available variables:
- candle: current OHLCV candle
- candles: full candle array
- index: current candle index
- position: current open long position, or null
- state: persistent object that keeps values between candles

Available functions:
- buy(): opens one long position at current close
- buy({ takeProfitPct: 6, stopLossPct: 3 }): opens long with auto TP/SL
- sell(): closes the open long position at current close
- sma(period): simple moving average of close prices ending at current candle
- sma(period, source): source can be "open", "high", "low", "close", or "volume"

Rules:
- Only call buy() when position is null.
- Only call sell() when position exists.
- Use takeProfitPct and stopLossPct when you want automatic TP/SL exits.
- Store memory as state.myValue, not var globals.
- Keep the strategy deterministic.
- Return nothing. Just call buy() and sell().
*/

const fast = sma(5);
const slow = sma(12);
const previousFast = index > 0 ? candles.slice(0, index).slice(-5).reduce((sum, item) => sum + item.close, 0) / 5 : null;
const previousSlow = index > 0 ? candles.slice(0, index).slice(-12).reduce((sum, item) => sum + item.close, 0) / 12 : null;

if (fast && slow && previousFast && previousSlow) {
  if (previousFast <= previousSlow && fast > slow) {
    buy({ takeProfitPct: 6, stopLossPct: 3 });
  }

  if (previousFast >= previousSlow && fast < slow) {
    sell();
  }
}`;

export function App() {
  const [symbols, setSymbols] = useState<SymbolCode[]>(['BTCUSDT', 'ETHUSDT']);
  const [symbol, setSymbol] = useState<SymbolCode>('ETHUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [strategy, setStrategy] = useState(defaultStrategy);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready');

  useEffect(() => {
    fetchSymbols()
      .then(setSymbols)
      .catch(() => setStatus('Could not load symbols. Is the backend running?'));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setStatus('Loading candles...');
    setResult(null);

    fetchHistory(symbol, timeframe)
      .then((nextCandles) => {
        setCandles(nextCandles);
        setStatus(`Loaded ${nextCandles.length} candles`);
      })
      .catch(() => setStatus('Could not load candles. Start the backend on port 4100.'))
      .finally(() => setIsLoading(false));
  }, [symbol, timeframe]);

  const handleRunStrategy = async () => {
    setIsLoading(true);
    setStatus('Running backtest...');

    try {
      const nextResult = await runBacktest(symbol, timeframe, strategy);
      setResult(nextResult);
      setStatus(`Backtest complete: ${nextResult.trades.length} trades`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Crypto Backtester</p>
          <h1>Strategy Tester</h1>
        </div>
        <div className="toolbar">
          <label>
            Symbol
            <select value={symbol} onChange={(event) => setSymbol(event.target.value as SymbolCode)}>
              {symbols.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeframe
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)}>
              {timeframes.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={isLoading} onClick={handleRunStrategy}>
            {isLoading ? 'Working...' : 'Run Strategy'}
          </button>
        </div>
      </header>

      <div className="status-bar">{status}</div>

      <section className="workspace">
        <ChartPanel candles={candles} markers={result?.markers ?? []} />
        <StrategyEditor symbol={symbol} timeframe={timeframe} value={strategy} onChange={setStrategy} />
        <ResultsPanel metrics={result?.metrics ?? null} trades={result?.trades ?? []} />
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'string'
  ) {
    return error.response.data.error;
  }

  return error instanceof Error ? error.message : 'Backtest failed';
}
