import { useCallback, useEffect, useRef, useState } from 'react';

import { ChartPanel } from './components/ChartPanel';
import { PaperTradingPanel, type PaperPosition, type PaperTradeRecord } from './components/PaperTradingPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { StrategyEditor } from './components/StrategyEditor';
import { fetchHistory, fetchSymbols, runBacktest } from './services/api';
import type { BacktestResult, Candle, ChartMarker, SymbolCode, Timeframe } from './types/market';

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
type AppMode = 'backtest' | 'papertrade';
const paperStartingBalance = 10000;
const paperCommissionRate = 0.001;
const initialReplayBars = 80;

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
  const [appMode, setAppMode] = useState<AppMode>('backtest');
  const [symbols, setSymbols] = useState<SymbolCode[]>(['BTCUSDT', 'ETHUSDT']);
  const [symbol, setSymbol] = useState<SymbolCode>('ETHUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [strategy, setStrategy] = useState(defaultStrategy);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [, setIsLoadingOlder] = useState(false);
  const [, setHasMoreCandles] = useState(true);

  // Paper Trading State
  const [paperBalance, setPaperBalance] = useState<number>(paperStartingBalance);
  const [paperPosition, setPaperPosition] = useState<PaperPosition | null>(null);
  const [paperTrades, setPaperTrades] = useState<PaperTradeRecord[]>([]);
  const [paperMarkers, setPaperMarkers] = useState<ChartMarker[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySpeedMs, setReplaySpeedMs] = useState(450);

  const candlesRef = useRef<Candle[]>([]);
  const isLoadingOlderRef = useRef(false);
  const hasMoreCandlesRef = useRef(true);

  useEffect(() => {
    fetchSymbols()
      .then(setSymbols)
      .catch(() => setStatus('Could not load symbols. Is the backend running?'));
  }, []);

  useEffect(() => {
    setPaperBalance(paperStartingBalance);
    setPaperPosition(null);
    setPaperTrades([]);
    setPaperMarkers([]);
    setIsReplayPlaying(false);
  }, [symbol, timeframe]);

  useEffect(() => {
    if (appMode === 'backtest') {
      setIsReplayPlaying(false);
    }
  }, [appMode]);

  useEffect(() => {
    setIsLoading(true);
    setStatus('Loading candles...');
    setResult(null);
    setHasMoreCandles(true);
    hasMoreCandlesRef.current = true;

    fetchHistory(symbol, timeframe)
      .then((nextCandles) => {
        candlesRef.current = nextCandles;
        setCandles(nextCandles);
        setReplayIndex(getInitialReplayIndex(nextCandles.length));
        setIsReplayPlaying(false);
        setStatus(`Loaded ${nextCandles.length} candles`);
      })
      .catch(() => setStatus('Could not load candles. Start the backend on port 4100.'))
      .finally(() => setIsLoading(false));
  }, [symbol, timeframe]);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const loadOlderCandles = useCallback(async () => {
    const currentCandles = candlesRef.current;

    if (isLoadingOlderRef.current || !hasMoreCandlesRef.current || currentCandles.length === 0) {
      return;
    }

    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);

    try {
      const oldestCandle = currentCandles[0];
      const olderCandles = await fetchHistory(symbol, timeframe, oldestCandle.time);

      if (olderCandles.length === 0) {
        hasMoreCandlesRef.current = false;
        setHasMoreCandles(false);
        return;
      }

      const existingTimes = new Set(currentCandles.map((candle) => candle.time));
      const uniqueOlderCandles = olderCandles.filter((candle) => !existingTimes.has(candle.time));

      if (uniqueOlderCandles.length === 0) {
        hasMoreCandlesRef.current = false;
        setHasMoreCandles(false);
        return;
      }

      const nextCandles = [...uniqueOlderCandles, ...currentCandles];
      candlesRef.current = nextCandles;
      setCandles(nextCandles);
      setReplayIndex((currentIndex) => currentIndex + uniqueOlderCandles.length);
      setStatus(`Loaded ${uniqueOlderCandles.length} older candles`);
    } catch {
      setStatus('Could not load older candles.');
    } finally {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
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

  useEffect(() => {
    if (appMode !== 'papertrade' || !isReplayPlaying || candles.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setReplayIndex((currentIndex) => {
        if (currentIndex >= candles.length - 1) {
          setIsReplayPlaying(false);
          return currentIndex;
        }

        return currentIndex + 1;
      });
    }, replaySpeedMs);

    return () => window.clearInterval(intervalId);
  }, [appMode, candles.length, isReplayPlaying, replaySpeedMs]);

  // -------------------------------------------------------------
  // Paper Trading Handlers
  // -------------------------------------------------------------
  const replayCandle = candles[replayIndex] ?? null;
  const visibleCandles = appMode === 'papertrade' ? candles.slice(0, replayIndex + 1) : candles;
  const activePaperMarkers = replayCandle
    ? paperMarkers.filter((marker) => marker.time <= replayCandle.time)
    : paperMarkers;

  const handlePaperBuy = (usdAmount: number) => {
    if (!replayCandle || paperPosition || usdAmount <= 0 || usdAmount > paperBalance) return;

    const currentPrice = replayCandle.close;
    const entryCommission = usdAmount * paperCommissionRate;
    const notionalUsd = usdAmount - entryCommission;
    const cryptoAmount = notionalUsd / currentPrice;

    const newPosition: PaperPosition = {
      amountCrypto: cryptoAmount,
      entryPrice: currentPrice,
      sizeUsd: notionalUsd,
      costUsd: usdAmount,
      entryCommission,
      entryTime: replayCandle.time,
    };

    setPaperBalance((prev) => prev - usdAmount);
    setPaperPosition(newPosition);

    const newTrade: PaperTradeRecord = {
      id: `trade-${Date.now()}`,
      type: 'BUY',
      price: currentPrice,
      amountCrypto: cryptoAmount,
      sizeUsd: notionalUsd,
      fee: entryCommission,
      equityAfter: paperBalance - usdAmount + notionalUsd,
      time: replayCandle.time,
    };

    setPaperTrades((prev) => [newTrade, ...prev]);

    // Chart marker
    const buyMarker: ChartMarker = {
      time: replayCandle.time as unknown as ChartMarker['time'],
      position: 'belowBar',
      color: '#089981',
      shape: 'arrowUp',
      text: `BUY ${formatCurrency(currentPrice)}`,
    };
    setPaperMarkers((prev) => [...prev, buyMarker]);
    setStatus(`Paper long opened: ${cryptoAmount.toFixed(4)} ${symbol.replace('USDT', '')} @ ${formatCurrency(currentPrice)}`);
  };

  const handlePaperSell = () => {
    if (!replayCandle || !paperPosition) return;

    const currentPrice = replayCandle.close;
    const grossReturnUsd = paperPosition.amountCrypto * currentPrice;
    const exitCommission = grossReturnUsd * paperCommissionRate;
    const returnUsd = grossReturnUsd - exitCommission;
    const pnl = returnUsd - paperPosition.costUsd;
    const pnlPct = (pnl / paperPosition.costUsd) * 100;

    setPaperBalance((prev) => prev + returnUsd);

    const newTrade: PaperTradeRecord = {
      id: `trade-${Date.now()}`,
      type: 'SELL',
      price: currentPrice,
      amountCrypto: paperPosition.amountCrypto,
      sizeUsd: returnUsd,
      pnl,
      pnlPct,
      fee: exitCommission,
      equityAfter: paperBalance + returnUsd,
      time: replayCandle.time,
    };

    setPaperTrades((prev) => [newTrade, ...prev]);

    // Chart marker
    const sellMarker: ChartMarker = {
      time: replayCandle.time as unknown as ChartMarker['time'],
      position: 'aboveBar',
      color: '#f23645',
      shape: 'arrowDown',
      text: `SELL ${formatSignedCurrency(pnl)}`,
    };
    setPaperMarkers((prev) => [...prev, sellMarker]);
    setPaperPosition(null);
    setStatus(`Paper long closed @ ${formatCurrency(currentPrice)} | PnL: ${formatSignedCurrency(pnl)} (${pnlPct.toFixed(2)}%)`);
  };

  const handleResetPaperAccount = () => {
    setPaperBalance(paperStartingBalance);
    setPaperPosition(null);
    setPaperTrades([]);
    setPaperMarkers([]);
    setStatus('Paper trading account reset to $10,000');
  };

  const handleReplayStep = (direction: -1 | 1) => {
    setReplayIndex((currentIndex) => {
      const nextIndex = clamp(currentIndex + direction, 0, Math.max(candles.length - 1, 0));

      if (nextIndex === candles.length - 1) {
        setIsReplayPlaying(false);
      }

      return nextIndex;
    });
  };

  const handleReplayReset = () => {
    setReplayIndex(getInitialReplayIndex(candles.length));
    setIsReplayPlaying(false);
    setPaperBalance(paperStartingBalance);
    setPaperPosition(null);
    setPaperTrades([]);
    setPaperMarkers([]);
    setStatus('Replay and paper account reset');
  };

  const handleReplayIndexChange = (nextIndex: number) => {
    setReplayIndex(clamp(nextIndex, 0, Math.max(candles.length - 1, 0)));
    setIsReplayPlaying(false);
  };

  const handleToggleReplay = () => {
    if (candles.length === 0 || replayIndex >= candles.length - 1) {
      setIsReplayPlaying(false);
      return;
    }

    setIsReplayPlaying((isPlaying) => !isPlaying);
  };

  // Active chart markers based on mode
  const activeChartMarkers = appMode === 'backtest' ? result?.markers ?? [] : activePaperMarkers;

  return (
    <main className={`app-shell app-shell-${appMode}`}>
      <header className="top-bar">
        <div className="title-section">
          <p className="eyebrow">Crypto Trading Terminal</p>
          <h1>{appMode === 'backtest' ? 'Strategy Backtesting' : 'Paper Trading'}</h1>
          <div className="mode-tabs">
            <button
              type="button"
              className={`mode-tab ${appMode === 'backtest' ? 'active' : ''}`}
              onClick={() => setAppMode('backtest')}
            >
              Backtest
            </button>
            <button
              type="button"
              className={`mode-tab ${appMode === 'papertrade' ? 'active' : ''}`}
              onClick={() => setAppMode('papertrade')}
            >
              Paper Trade
            </button>
          </div>
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

          {appMode === 'backtest' && (
            <button type="button" disabled={isLoading} onClick={handleRunStrategy}>
              {isLoading ? 'Working...' : 'Run Strategy'}
            </button>
          )}
        </div>
      </header>

      <div className="status-bar">{status}</div>

      <section className={`workspace workspace-${appMode}`}>
        <ChartPanel
          key={`${symbol}-${timeframe}`}
          candles={visibleCandles}
          markers={activeChartMarkers}
          onLoadOlder={loadOlderCandles}
          followLatest={appMode === 'papertrade'}
          replayLabel={appMode === 'papertrade' ? 'REPLAY' : undefined}
        />

        {appMode === 'backtest' ? (
          <>
            <StrategyEditor symbol={symbol} timeframe={timeframe} value={strategy} onChange={setStrategy} />
            <ResultsPanel metrics={result?.metrics ?? null} trades={result?.trades ?? []} />
          </>
        ) : (
          <PaperTradingPanel
            symbol={symbol}
            currentCandle={replayCandle}
            balance={paperBalance}
            position={paperPosition}
            trades={paperTrades}
            commissionRate={paperCommissionRate}
            replayIndex={replayIndex}
            totalCandles={candles.length}
            isReplayPlaying={isReplayPlaying}
            replaySpeedMs={replaySpeedMs}
            onBuy={handlePaperBuy}
            onSell={handlePaperSell}
            onResetAccount={handleResetPaperAccount}
            onToggleReplay={handleToggleReplay}
            onStepReplay={handleReplayStep}
            onReplayIndexChange={handleReplayIndexChange}
            onReplaySpeedChange={setReplaySpeedMs}
            onResetReplay={handleReplayReset}
          />
        )}
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`;
}

function getInitialReplayIndex(candleCount: number): number {
  return Math.max(0, Math.min(initialReplayBars, candleCount - 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
