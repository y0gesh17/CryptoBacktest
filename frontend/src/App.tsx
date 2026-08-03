import { useState } from 'react';

import { ChartPanel } from './components/ChartPanel';
import { PaperTradingPanel } from './components/PaperTradingPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { StrategyEditor } from './components/StrategyEditor';
import { useBacktest } from './hooks/useBacktest';
import { useMarketData } from './hooks/useMarketData';
import { usePaperTrading } from './hooks/usePaperTrading';
import type { SymbolCode, Timeframe } from './types/market';

/**
 * App is only an orchestrator:
 *   market data → mode (backtest | paper) → panels
 */
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const DEFAULT_STRATEGY = `/*
SMA crossover (runs once per candle, oldest → newest)

Available: candle, candles, index, position, state
Functions: buy(), buy({ takeProfitPct, stopLossPct }), sell(), sma(period)

1. Wait until both SMAs exist
2. Golden cross → buy with TP/SL
3. Death cross → sell
*/

const fast = sma(5);
const slow = sma(12);
if (!fast || !slow) return;

const wasBelow = state.fastWasBelowSlow === true;
const isAbove = fast > slow;

if (!position && wasBelow && isAbove) {
  buy({ takeProfitPct: 6, stopLossPct: 3 });
}

if (position && !wasBelow && !isAbove) {
  sell();
}

state.fastWasBelowSlow = !isAbove;
`;

type AppMode = 'backtest' | 'papertrade';

export function App() {
  const [mode, setMode] = useState<AppMode>('backtest');
  const [symbol, setSymbol] = useState<SymbolCode>('ETHUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);

  const market = useMarketData(symbol, timeframe);
  const backtest = useBacktest(symbol, timeframe, strategy, market.setStatus, market.setIsLoading);
  const paper = usePaperTrading(
    market.candles,
    market.revision,
    symbol,
    mode === 'papertrade',
    market.setStatus
  );

  const handleLoadOlder = async () => {
    const added = await market.loadOlderCandles();
    if (added) paper.shiftReplayIndex(added);
  };

  const chartCandles = mode === 'papertrade' ? paper.visibleCandles : market.candles;
  const chartMarkers = mode === 'backtest' ? backtest.result?.markers ?? [] : paper.markers;

  return (
    <main className={`app-shell app-shell-${mode}`}>
      <header className="top-bar">
        <div className="title-section">
          <p className="eyebrow">Crypto Trading Terminal</p>
          <h1>{mode === 'backtest' ? 'Strategy Backtesting' : 'Paper Trading'}</h1>
          <div className="mode-tabs">
            <button
              type="button"
              className={`mode-tab ${mode === 'backtest' ? 'active' : ''}`}
              onClick={() => setMode('backtest')}
            >
              Backtest
            </button>
            <button
              type="button"
              className={`mode-tab ${mode === 'papertrade' ? 'active' : ''}`}
              onClick={() => setMode('papertrade')}
            >
              Paper Trade
            </button>
          </div>
        </div>

        <div className="toolbar">
          <label>
            Symbol
            <select value={symbol} onChange={(e) => setSymbol(e.target.value as SymbolCode)}>
              {market.symbols.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeframe
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
              {TIMEFRAMES.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          {mode === 'backtest' && (
            <button type="button" disabled={market.isLoading} onClick={backtest.run}>
              {market.isLoading ? 'Working...' : 'Run Strategy'}
            </button>
          )}
        </div>
      </header>

      <div className="status-bar">{market.status}</div>

      <section className={`workspace workspace-${mode}`}>
        <ChartPanel
          key={`${symbol}-${timeframe}`}
          candles={chartCandles}
          markers={chartMarkers}
          onLoadOlder={handleLoadOlder}
          followLatest={mode === 'papertrade'}
          hideInternalReplay={mode === 'papertrade'}
          replayLabel={mode === 'papertrade' ? 'REPLAY' : undefined}
        />

        {mode === 'backtest' ? (
          <>
            <StrategyEditor symbol={symbol} timeframe={timeframe} value={strategy} onChange={setStrategy} />
            <ResultsPanel
              metrics={backtest.result?.metrics ?? null}
              trades={backtest.result?.trades ?? []}
            />
          </>
        ) : (
          <PaperTradingPanel
            symbol={symbol}
            currentCandle={paper.currentCandle}
            balance={paper.balance}
            position={paper.position}
            trades={paper.trades}
            commissionRate={paper.commissionRate}
            replayIndex={paper.replayIndex}
            totalCandles={market.candles.length}
            isReplayPlaying={paper.isPlaying}
            replaySpeedMs={paper.speedMs}
            onBuy={paper.buy}
            onSell={paper.sell}
            onResetAccount={paper.resetAccountOnly}
            onToggleReplay={paper.togglePlay}
            onStepReplay={paper.stepReplay}
            onReplayIndexChange={paper.setReplayIndexSafe}
            onReplaySpeedChange={paper.setSpeedMs}
            onResetReplay={paper.resetReplay}
          />
        )}
      </section>
    </main>
  );
}
