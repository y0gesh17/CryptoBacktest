import type {
  BacktestMetrics,
  Candle,
  ChartMarker,
  EquityPoint,
  ExitReason,
  Trade,
} from '../types/market.js';

/**
 * Backtest engine — interview-friendly mental model:
 *
 *   1. Compile user strategy JS into a callable function
 *   2. Walk candles oldest → newest
 *      a. Risk exits first (stop-loss / take-profit)
 *      b. Strategy decides buy / sell
 *      c. Mark portfolio to market (equity + drawdown)
 *   3. Force-close any open position at the last candle
 *   4. Aggregate trades into performance metrics
 */

const INITIAL_CAPITAL = 10_000;
const COMMISSION_RATE = 0.001; // 0.1% per side

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

interface BacktestResult {
  markers: ChartMarker[];
  trades: Trade[];
  equity: EquityPoint[];
  metrics: BacktestMetrics;
}

interface OpenPosition {
  entryTime: number;
  entryIndex: number;
  entryPrice: number;
  quantity: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
}

interface RiskOptions {
  takeProfitPct?: number;
  stopLossPct?: number;
}

interface StrategyContext {
  candle: Candle;
  candles: Candle[];
  index: number;
  position: OpenPosition | null;
  state: Record<string, unknown>;
  buy: (options?: RiskOptions) => void;
  sell: () => void;
  sma: (period: number, source?: CandleSource) => number | null;
}

type CandleSource = 'open' | 'high' | 'low' | 'close' | 'volume';
type StrategyFn = (context: StrategyContext) => void;

interface Portfolio {
  cash: number;
  position: OpenPosition | null;
}

interface SimulationState {
  portfolio: Portfolio;
  markers: ChartMarker[];
  trades: Trade[];
  equity: EquityPoint[];
  peakEquity: number;
  maxDrawdownPct: number;
  strategyState: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. Entry point — thin orchestration layer
// ---------------------------------------------------------------------------

export function runBacktest(candles: Candle[], strategyCode: string): BacktestResult {
  const strategy = compileStrategy(strategyCode);
  const simulation = simulate(candles, strategy);
  const finalEquity = simulation.equity.at(-1)?.value ?? INITIAL_CAPITAL;

  return {
    markers: simulation.markers,
    trades: simulation.trades,
    equity: simulation.equity,
    metrics: calculateMetrics(simulation.trades, finalEquity, simulation.maxDrawdownPct),
  };
}

// ---------------------------------------------------------------------------
// 2. Simulation — candle-by-candle loop
// ---------------------------------------------------------------------------

function simulate(candles: Candle[], strategy: StrategyFn): SimulationState {
  const state = createInitialState();

  for (let index = 0; index < candles.length; index += 1) {
    processCandle(state, candles, index, strategy);
  }

  // Step 3: if still in a trade when history ends, flatten at last close
  if (state.portfolio.position && candles.length > 0) {
    const lastIndex = candles.length - 1;
    closeLong(state, candles[lastIndex], lastIndex, 'END_OF_TEST');
  }

  return state;
}

function createInitialState(): SimulationState {
  return {
    portfolio: { cash: INITIAL_CAPITAL, position: null },
    markers: [],
    trades: [],
    equity: [],
    peakEquity: INITIAL_CAPITAL,
    maxDrawdownPct: 0,
    strategyState: {},
  };
}

/**
 * One bar of the backtest. Order matters:
 * risk management → strategy signals → equity snapshot.
 */
function processCandle(
  state: SimulationState,
  candles: Candle[],
  index: number,
  strategy: StrategyFn
): void {
  const candle = candles[index];

  // a) Honor SL/TP before the strategy can act on this bar
  applyRiskExits(state, candle, index);

  // b) Let the user strategy call buy() / sell()
  strategy(buildStrategyContext(state, candles, index));

  // c) Mark-to-market: cash if flat, position value if long
  recordEquity(state, candle);
}

function buildStrategyContext(
  state: SimulationState,
  candles: Candle[],
  index: number
): StrategyContext {
  const candle = candles[index];

  return {
    candle,
    candles,
    index,
    position: state.portfolio.position,
    state: state.strategyState,
    buy: (options) => openLong(state, candle, index, options),
    sell: () => closeLong(state, candle, index, 'SELL'),
    sma: (period, source = 'close') => sma(candles, index, period, source),
  };
}

// ---------------------------------------------------------------------------
// 2a. Risk management — automatic exits
// ---------------------------------------------------------------------------

function applyRiskExits(state: SimulationState, candle: Candle, index: number): void {
  const position = state.portfolio.position;
  if (!position) return;

  // Stop-loss checked first (conservative: if both hit in same bar, SL wins)
  if (position.stopLossPrice !== undefined && candle.low <= position.stopLossPrice) {
    closeLong(state, candle, index, 'STOP_LOSS', position.stopLossPrice);
    return;
  }

  if (position.takeProfitPrice !== undefined && candle.high >= position.takeProfitPrice) {
    closeLong(state, candle, index, 'TAKE_PROFIT', position.takeProfitPrice);
  }
}

// ---------------------------------------------------------------------------
// 2b. Portfolio actions — open / close a long
// ---------------------------------------------------------------------------

function openLong(
  state: SimulationState,
  candle: Candle,
  index: number,
  options: RiskOptions = {}
): void {
  // Long-only, one position at a time
  if (state.portfolio.position) return;

  const entryPrice = candle.close;
  const commission = state.portfolio.cash * COMMISSION_RATE;
  const spendableCash = state.portfolio.cash - commission;
  const quantity = spendableCash / entryPrice;

  state.portfolio.position = {
    entryTime: candle.time,
    entryIndex: index,
    entryPrice,
    quantity,
    takeProfitPrice: priceFromPct(entryPrice, options.takeProfitPct, 'up'),
    stopLossPrice: priceFromPct(entryPrice, options.stopLossPct, 'down'),
  };
  state.portfolio.cash = 0;

  state.markers.push({
    time: candle.time,
    position: 'belowBar',
    color: '#0f9f6e',
    shape: 'arrowUp',
    text: entryMarkerText(state.portfolio.position),
  });
}

function closeLong(
  state: SimulationState,
  candle: Candle,
  index: number,
  exitReason: ExitReason,
  exitPrice = candle.close
): void {
  const position = state.portfolio.position;
  if (!position) return;

  const grossExitValue = position.quantity * exitPrice;
  const exitCommission = grossExitValue * COMMISSION_RATE;
  const entryValue = position.quantity * position.entryPrice;
  const entryCommission = entryValue * COMMISSION_RATE;

  const grossPnl = grossExitValue - entryValue;
  const commission = entryCommission + exitCommission;
  const netPnl = grossPnl - commission;

  state.portfolio.cash = grossExitValue - exitCommission;
  state.portfolio.position = null;

  state.trades.push({
    id: state.trades.length + 1,
    entryTime: position.entryTime,
    exitTime: candle.time,
    entryPrice: round(position.entryPrice),
    exitPrice: round(exitPrice),
    exitReason,
    quantity: Number(position.quantity.toFixed(6)),
    grossPnl: round(grossPnl),
    commission: round(commission),
    netPnl: round(netPnl),
    holdingBars: index - position.entryIndex,
  });

  state.markers.push({
    time: candle.time,
    position: 'aboveBar',
    color: exitMarkerColor(exitReason),
    shape: 'arrowDown',
    text: exitMarkerText(exitReason),
  });
}

// ---------------------------------------------------------------------------
// 2c. Equity curve + drawdown
// ---------------------------------------------------------------------------

function recordEquity(state: SimulationState, candle: Candle): void {
  const { portfolio } = state;
  const currentEquity = portfolio.position
    ? portfolio.position.quantity * candle.close
    : portfolio.cash;

  state.peakEquity = Math.max(state.peakEquity, currentEquity);

  const drawdownPct =
    state.peakEquity === 0 ? 0 : ((state.peakEquity - currentEquity) / state.peakEquity) * 100;
  state.maxDrawdownPct = Math.max(state.maxDrawdownPct, drawdownPct);

  state.equity.push({ time: candle.time, value: round(currentEquity) });
}

// ---------------------------------------------------------------------------
// Strategy sandbox — compile user JS safely enough for a demo
// ---------------------------------------------------------------------------

function compileStrategy(strategyCode: string): StrategyFn {
  const legacyStateNames = extractLegacyStateNames(strategyCode);
  const body = strategyCode.replace(/\bvar\s+/g, '');

  // new Function isolates the strategy; Proxy + with() lets `state.x = 1`
  // and bare `x = 1` both persist across candles via strategyState.
  const factory = new Function(
    'context',
    'legacyStateNames',
    `const { candle, candles, index, position, state, buy, sell, sma } = context;
const sandboxState = new Proxy(state, {
  has(target, property) {
    return property in target || legacyStateNames.includes(String(property));
  },
  get(target, property) {
    return target[property];
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});
with (sandboxState) {
${body}
}`
  );

  return (context) => {
    factory(context, legacyStateNames);
  };
}

function extractLegacyStateNames(strategyCode: string): string[] {
  const names = new Set<string>();
  const varPattern = /\bvar\s+([A-Za-z_$][\w$]*)/g;
  let match = varPattern.exec(strategyCode);

  while (match) {
    names.add(match[1]);
    match = varPattern.exec(strategyCode);
  }

  return [...names];
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

function sma(
  candles: Candle[],
  index: number,
  period: number,
  source: CandleSource
): number | null {
  if (period <= 0 || index + 1 < period) return null;

  let total = 0;
  for (let i = index + 1 - period; i <= index; i += 1) {
    total += candles[i][source];
  }

  return total / period;
}

// ---------------------------------------------------------------------------
// 4. Performance metrics from closed trades
// ---------------------------------------------------------------------------

function calculateMetrics(
  trades: Trade[],
  finalEquity: number,
  maxDrawdownPct: number
): BacktestMetrics {
  const netPnl = finalEquity - INITIAL_CAPITAL;
  const winners = trades.filter((trade) => trade.netPnl > 0);
  const losers = trades.filter((trade) => trade.netPnl < 0);

  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));

  return {
    initialCapital: INITIAL_CAPITAL,
    finalEquity: round(finalEquity),
    netPnl: round(netPnl),
    totalReturnPct: round((netPnl / INITIAL_CAPITAL) * 100),
    totalTrades: trades.length,
    winRatePct: trades.length === 0 ? 0 : round((winners.length / trades.length) * 100),
    maxDrawdownPct: round(maxDrawdownPct),
    profitFactor: profitFactor(grossProfit, grossLoss),
  };
}

function profitFactor(grossProfit: number, grossLoss: number): number {
  if (grossLoss === 0) return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  return round(grossProfit / grossLoss);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function priceFromPct(
  entryPrice: number,
  pct: number | undefined,
  direction: 'up' | 'down'
): number | undefined {
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0) return undefined;
  return direction === 'up' ? entryPrice * (1 + pct / 100) : entryPrice * (1 - pct / 100);
}

function entryMarkerText(position: OpenPosition): string {
  const parts = [
    position.takeProfitPrice === undefined ? null : `TP ${round(position.takeProfitPrice)}`,
    position.stopLossPrice === undefined ? null : `SL ${round(position.stopLossPrice)}`,
  ].filter(Boolean);

  return parts.length === 0 ? 'BUY' : `BUY ${parts.join(' ')}`;
}

function exitMarkerText(exitReason: ExitReason): string {
  const labels: Record<ExitReason, string> = {
    SELL: 'SELL',
    TAKE_PROFIT: 'TP HIT',
    STOP_LOSS: 'SL HIT',
    END_OF_TEST: 'EOT',
  };
  return labels[exitReason];
}

function exitMarkerColor(exitReason: ExitReason): string {
  const colors: Record<ExitReason, string> = {
    SELL: '#d64545',
    TAKE_PROFIT: '#0f9f6e',
    STOP_LOSS: '#d64545',
    END_OF_TEST: '#52616b',
  };
  return colors[exitReason];
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
