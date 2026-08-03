import { useCallback, useEffect, useState } from 'react';

import type { PaperPosition, PaperTradeRecord } from '../components/PaperTradingPanel';
import type { Candle, ChartMarker } from '../types/market';
import { formatCurrency, formatSignedCurrency } from '../utils/format';

const STARTING_BALANCE = 10_000;
const COMMISSION_RATE = 0.001;
const INITIAL_REPLAY_BARS = 80;

/**
 * Paper trading = manual buy/sell on a candle replay cursor.
 *
 * 1. Replay advances a cursor over historical candles
 * 2. Buy spends cash at current close (minus fee)
 * 3. Sell returns cash at current close (minus fee) and records PnL
 */
export function usePaperTrading(
  candles: Candle[],
  marketRevision: number,
  symbol: string,
  enabled: boolean,
  onStatus: (message: string) => void
) {
  const [balance, setBalance] = useState(STARTING_BALANCE);
  const [position, setPosition] = useState<PaperPosition | null>(null);
  const [trades, setTrades] = useState<PaperTradeRecord[]>([]);
  const [markers, setMarkers] = useState<ChartMarker[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(450);

  const clearAccount = useCallback(() => {
    setBalance(STARTING_BALANCE);
    setPosition(null);
    setTrades([]);
    setMarkers([]);
  }, []);

  // Fresh market load → reset account + replay start point
  useEffect(() => {
    clearAccount();
    setReplayIndex(initialReplayIndex(candles.length));
    setIsPlaying(false);
  }, [marketRevision, clearAccount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) setIsPlaying(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isPlaying || candles.length === 0) return;

    const id = window.setInterval(() => {
      setReplayIndex((index) => {
        if (index >= candles.length - 1) {
          setIsPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, speedMs);

    return () => window.clearInterval(id);
  }, [enabled, isPlaying, candles.length, speedMs]);

  const currentCandle = candles[replayIndex] ?? null;
  const visibleCandles = candles.slice(0, replayIndex + 1);
  const visibleMarkers = currentCandle
    ? markers.filter((m) => m.time <= currentCandle.time)
    : markers;

  const buy = (usdAmount: number) => {
    if (!currentCandle || position || usdAmount <= 0 || usdAmount > balance) return;

    const price = currentCandle.close;
    const fee = usdAmount * COMMISSION_RATE;
    const notional = usdAmount - fee;
    const quantity = notional / price;

    setBalance((cash) => cash - usdAmount);
    setPosition({
      amountCrypto: quantity,
      entryPrice: price,
      sizeUsd: notional,
      costUsd: usdAmount,
      entryCommission: fee,
      entryTime: currentCandle.time,
    });
    setTrades((prev) => [
      {
        id: `trade-${Date.now()}`,
        type: 'BUY',
        price,
        amountCrypto: quantity,
        sizeUsd: notional,
        fee,
        equityAfter: balance - usdAmount + notional,
        time: currentCandle.time,
      },
      ...prev,
    ]);
    setMarkers((prev) => [
      ...prev,
      {
        time: currentCandle.time,
        position: 'belowBar',
        color: '#089981',
        shape: 'arrowUp',
        text: `BUY ${formatCurrency(price)}`,
      },
    ]);
    onStatus(`Paper long: ${quantity.toFixed(4)} ${symbol.replace('USDT', '')} @ ${formatCurrency(price)}`);
  };

  const sell = () => {
    if (!currentCandle || !position) return;

    const price = currentCandle.close;
    const gross = position.amountCrypto * price;
    const fee = gross * COMMISSION_RATE;
    const proceeds = gross - fee;
    const pnl = proceeds - position.costUsd;
    const pnlPct = (pnl / position.costUsd) * 100;

    setBalance((cash) => cash + proceeds);
    setTrades((prev) => [
      {
        id: `trade-${Date.now()}`,
        type: 'SELL',
        price,
        amountCrypto: position.amountCrypto,
        sizeUsd: proceeds,
        pnl,
        pnlPct,
        fee,
        equityAfter: balance + proceeds,
        time: currentCandle.time,
      },
      ...prev,
    ]);
    setMarkers((prev) => [
      ...prev,
      {
        time: currentCandle.time,
        position: 'aboveBar',
        color: '#f23645',
        shape: 'arrowDown',
        text: `SELL ${formatSignedCurrency(pnl)}`,
      },
    ]);
    setPosition(null);
    onStatus(`Paper closed @ ${formatCurrency(price)} | PnL: ${formatSignedCurrency(pnl)} (${pnlPct.toFixed(2)}%)`);
  };

  const stepReplay = (direction: -1 | 1) => {
    setReplayIndex((index) => {
      const next = clamp(index + direction, 0, Math.max(candles.length - 1, 0));
      if (next === candles.length - 1) setIsPlaying(false);
      return next;
    });
  };

  const setReplayIndexSafe = (index: number) => {
    setReplayIndex(clamp(index, 0, Math.max(candles.length - 1, 0)));
    setIsPlaying(false);
  };

  /** Keep the same candle selected after older history is prepended. */
  const shiftReplayIndex = (addedCount: number) => {
    if (addedCount > 0) setReplayIndex((index) => index + addedCount);
  };

  const togglePlay = () => {
    if (candles.length === 0 || replayIndex >= candles.length - 1) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying((playing) => !playing);
  };

  const resetReplay = () => {
    clearAccount();
    setReplayIndex(initialReplayIndex(candles.length));
    setIsPlaying(false);
    onStatus('Replay and paper account reset');
  };

  const resetAccountOnly = () => {
    clearAccount();
    onStatus('Paper trading account reset to $10,000');
  };

  return {
    balance,
    position,
    trades,
    markers: visibleMarkers,
    visibleCandles,
    currentCandle,
    replayIndex,
    isPlaying,
    speedMs,
    commissionRate: COMMISSION_RATE,
    buy,
    sell,
    stepReplay,
    setReplayIndexSafe,
    shiftReplayIndex,
    togglePlay,
    setSpeedMs,
    resetReplay,
    resetAccountOnly,
  };
}

function initialReplayIndex(count: number): number {
  return Math.max(0, Math.min(INITIAL_REPLAY_BARS, count - 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
