export type SymbolCode = 'BTCUSDT' | 'ETHUSDT';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TradeSide = 'BUY' | 'SELL';

export type ExitReason = 'SELL' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'END_OF_TEST';

export interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

export interface Trade {
  id: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  exitReason: ExitReason;
  quantity: number;
  grossPnl: number;
  commission: number;
  netPnl: number;
  holdingBars: number;
}

export interface EquityPoint {
  time: number;
  value: number;
}

export interface BacktestMetrics {
  initialCapital: number;
  finalEquity: number;
  netPnl: number;
  totalReturnPct: number;
  totalTrades: number;
  winRatePct: number;
  maxDrawdownPct: number;
  profitFactor: number;
}
