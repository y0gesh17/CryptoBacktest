import type {
  BacktestMetrics,
  Candle,
  ChartMarker,
  EquityPoint,
  ExitReason,
  Trade,
} from '../types/market.js';

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
  sma: (period: number, source?: 'open' | 'high' | 'low' | 'close' | 'volume') => number | null;
}

const initialCapital = 10000;
const commissionRate = 0.001;

export function runBacktest(candles: Candle[], strategyCode: string): BacktestResult {
  const strategy = compileStrategy(strategyCode);
  const markers: ChartMarker[] = [];
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  let cash = initialCapital;
  let position: OpenPosition | null = null;
  let peakEquity = initialCapital;
  let maxDrawdownPct = 0;
  const state: Record<string, unknown> = {};

  const buy = (candle: Candle, index: number, options: RiskOptions = {}) => {
    if (position) {
      return;
    }

    const commission = cash * commissionRate;
    const availableCash = cash - commission;
    const quantity = availableCash / candle.close;

    position = {
      entryTime: candle.time,
      entryIndex: index,
      entryPrice: candle.close,
      quantity,
      takeProfitPrice: calculateTakeProfitPrice(candle.close, options.takeProfitPct),
      stopLossPrice: calculateStopLossPrice(candle.close, options.stopLossPct),
    };
    cash = 0;

    markers.push({
      time: candle.time,
      position: 'belowBar',
      color: '#0f9f6e',
      shape: 'arrowUp',
      text: createEntryMarkerText(position),
    });
  };

  const sell = (
    candle: Candle,
    index: number,
    exitReason: ExitReason = 'SELL',
    exitPrice = candle.close
  ) => {
    if (!position) {
      return;
    }

    const grossExitValue = position.quantity * exitPrice;
    const exitCommission = grossExitValue * commissionRate;
    const entryValue = position.quantity * position.entryPrice;
    const entryCommission = entryValue * commissionRate;
    const grossPnl = grossExitValue - entryValue;
    const commission = entryCommission + exitCommission;
    const netPnl = grossPnl - commission;

    cash = grossExitValue - exitCommission;

    trades.push({
      id: trades.length + 1,
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

    markers.push({
      time: candle.time,
      position: 'aboveBar',
      color: getExitMarkerColor(exitReason),
      shape: 'arrowDown',
      text: getExitMarkerText(exitReason),
    });

    position = null;
  };

  candles.forEach((candle, index) => {
    checkRiskExit(candle, index);

    const context: StrategyContext = {
      candle,
      candles,
      index,
      position,
      state,
      buy: (options) => buy(candle, index, options),
      sell: () => sell(candle, index),
      sma: (period, source = 'close') => sma(candles, index, period, source),
    };

    strategy(context);

    const currentEquity = position ? position.quantity * candle.close : cash;
    peakEquity = Math.max(peakEquity, currentEquity);
    const drawdownPct = peakEquity === 0 ? 0 : ((peakEquity - currentEquity) / peakEquity) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

    equity.push({
      time: candle.time,
      value: round(currentEquity),
    });
  });

  if (position && candles.length > 0) {
    sell(candles[candles.length - 1], candles.length - 1, 'END_OF_TEST');
  }

  const finalEquity = equity.at(-1)?.value ?? initialCapital;

  return {
    markers,
    trades,
    equity,
    metrics: calculateMetrics(trades, finalEquity, maxDrawdownPct),
  };

  function checkRiskExit(candle: Candle, index: number): void {
    if (!position) {
      return;
    }

    if (position.stopLossPrice !== undefined && candle.low <= position.stopLossPrice) {
      sell(candle, index, 'STOP_LOSS', position.stopLossPrice);
      return;
    }

    if (position.takeProfitPrice !== undefined && candle.high >= position.takeProfitPrice) {
      sell(candle, index, 'TAKE_PROFIT', position.takeProfitPrice);
    }
  }
}

function compileStrategy(strategyCode: string): (context: StrategyContext) => void {
  const legacyStateNames = extractLegacyStateNames(strategyCode);
  const normalizedStrategyCode = strategyCode.replace(/\bvar\s+/g, '');
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
${normalizedStrategyCode}
}`
  );

  return (context: StrategyContext) => {
    factory(context, legacyStateNames);
  };
}

function calculateTakeProfitPrice(entryPrice: number, takeProfitPct: number | undefined): number | undefined {
  return isValidPct(takeProfitPct) ? entryPrice * (1 + takeProfitPct / 100) : undefined;
}

function calculateStopLossPrice(entryPrice: number, stopLossPct: number | undefined): number | undefined {
  return isValidPct(stopLossPct) ? entryPrice * (1 - stopLossPct / 100) : undefined;
}

function isValidPct(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function createEntryMarkerText(position: OpenPosition): string {
  const riskLabels = [
    position.takeProfitPrice === undefined ? null : `TP ${round(position.takeProfitPrice)}`,
    position.stopLossPrice === undefined ? null : `SL ${round(position.stopLossPrice)}`,
  ].filter(Boolean);

  return riskLabels.length === 0 ? 'BUY' : `BUY ${riskLabels.join(' ')}`;
}

function getExitMarkerText(exitReason: ExitReason): string {
  const labels: Record<ExitReason, string> = {
    SELL: 'SELL',
    TAKE_PROFIT: 'TP HIT',
    STOP_LOSS: 'SL HIT',
    END_OF_TEST: 'EOT',
  };

  return labels[exitReason];
}

function getExitMarkerColor(exitReason: ExitReason): string {
  const colors: Record<ExitReason, string> = {
    SELL: '#d64545',
    TAKE_PROFIT: '#0f9f6e',
    STOP_LOSS: '#d64545',
    END_OF_TEST: '#52616b',
  };

  return colors[exitReason];
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

function sma(
  candles: Candle[],
  index: number,
  period: number,
  source: 'open' | 'high' | 'low' | 'close' | 'volume'
): number | null {
  if (period <= 0 || index + 1 < period) {
    return null;
  }

  const slice = candles.slice(index + 1 - period, index + 1);
  const total = slice.reduce((sum, candle) => sum + candle[source], 0);

  return total / period;
}

function calculateMetrics(
  trades: Trade[],
  finalEquity: number,
  maxDrawdownPct: number
): BacktestMetrics {
  const netPnl = finalEquity - initialCapital;
  const winningTrades = trades.filter((trade) => trade.netPnl > 0);
  const grossProfit = winningTrades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(
    trades.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0)
  );

  return {
    initialCapital,
    finalEquity: round(finalEquity),
    netPnl: round(netPnl),
    totalReturnPct: round((netPnl / initialCapital) * 100),
    totalTrades: trades.length,
    winRatePct: trades.length === 0 ? 0 : round((winningTrades.length / trades.length) * 100),
    maxDrawdownPct: round(maxDrawdownPct),
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : round(grossProfit / grossLoss),
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
