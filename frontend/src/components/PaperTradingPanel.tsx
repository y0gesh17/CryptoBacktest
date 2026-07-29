import { useMemo, useState } from 'react';

import type { Candle } from '../types/market';

export interface PaperPosition {
  amountCrypto: number;
  entryPrice: number;
  sizeUsd: number;
  costUsd: number;
  entryCommission: number;
  entryTime: number;
}

export interface PaperTradeRecord {
  id: string;
  type: 'BUY' | 'SELL';
  price: number;
  amountCrypto: number;
  sizeUsd: number;
  fee: number;
  equityAfter: number;
  pnl?: number;
  pnlPct?: number;
  time: number;
}

interface PaperTradingPanelProps {
  symbol: string;
  currentCandle: Candle | null;
  balance: number;
  position: PaperPosition | null;
  trades: PaperTradeRecord[];
  commissionRate: number;
  replayIndex: number;
  totalCandles: number;
  isReplayPlaying: boolean;
  replaySpeedMs: number;
  onBuy: (usdAmount: number) => void;
  onSell: () => void;
  onResetAccount: () => void;
  onToggleReplay: () => void;
  onStepReplay: (direction: -1 | 1) => void;
  onReplayIndexChange: (index: number) => void;
  onReplaySpeedChange: (speedMs: number) => void;
  onResetReplay: () => void;
}

export function PaperTradingPanel({
  symbol,
  currentCandle,
  balance,
  position,
  trades,
  commissionRate,
  replayIndex,
  totalCandles,
  isReplayPlaying,
  replaySpeedMs,
  onBuy,
  onSell,
  onResetAccount,
  onToggleReplay,
  onStepReplay,
  onReplayIndexChange,
  onReplaySpeedChange,
  onResetReplay,
}: PaperTradingPanelProps) {
  const [orderAmount, setOrderAmount] = useState('1000');
  const baseAsset = symbol.replace('USDT', '');
  const currentPrice = currentCandle?.close ?? 0;
  const parsedAmount = Number(orderAmount);
  const orderAmountIsValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance;

  const grossPositionValue = position ? position.amountCrypto * currentPrice : 0;
  const estimatedExitFee = grossPositionValue * commissionRate;
  const positionValue = position ? grossPositionValue - estimatedExitFee : 0;
  const unrealizedPnl = position ? positionValue - position.costUsd : 0;
  const unrealizedPnlPct = position ? (unrealizedPnl / position.costUsd) * 100 : 0;
  const totalEquity = balance + positionValue;
  const realizedPnl = useMemo(
    () => trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0),
    [trades]
  );
  const estimatedEntryFee = orderAmountIsValid ? parsedAmount * commissionRate : 0;
  const estimatedQuantity = orderAmountIsValid && currentPrice > 0
    ? (parsedAmount - estimatedEntryFee) / currentPrice
    : 0;
  const replayProgress = totalCandles <= 1 ? 0 : (replayIndex / (totalCandles - 1)) * 100;
  const hasPaperActivity = trades.length > 0 || !!position;

  const handleBuyClick = () => {
    if (orderAmountIsValid) {
      onBuy(parsedAmount);
    }
  };

  return (
    <aside className="paper-panel panel">
      <div className="paper-header">
        <div>
          <p className="eyebrow">Paper Account</p>
          <h2>{symbol}</h2>
        </div>
        <div className="price-tile">
          <span>Mark</span>
          <strong>{formatCurrency(currentPrice)}</strong>
        </div>
      </div>

      <div className="paper-summary">
        <Metric label="Cash" value={formatCurrency(balance)} />
        <Metric label="Equity" value={formatCurrency(totalEquity)} />
        <Metric label="Realized PnL" value={formatSignedCurrency(realizedPnl)} tone={realizedPnl >= 0 ? 'good' : 'bad'} />
        <Metric label="Exposure" value={formatCurrency(positionValue)} />
      </div>

      <section className="paper-section replay-section">
        <div className="paper-section-heading">
          <h3>Market Replay</h3>
          <span>{totalCandles === 0 ? 'No candles' : `${replayIndex + 1} / ${totalCandles}`}</span>
        </div>

        <div className="replay-meta">
          <span>{currentCandle ? formatFullTime(currentCandle.time) : 'Waiting for candles'}</span>
          <strong>{replayProgress.toFixed(0)}%</strong>
        </div>

        <input
          className="replay-slider"
          type="range"
          min="0"
          max={Math.max(totalCandles - 1, 0)}
          value={replayIndex}
          disabled={totalCandles === 0 || hasPaperActivity}
          onChange={(event) => onReplayIndexChange(Number(event.target.value))}
        />

        <div className="replay-controls">
          <button
            type="button"
            className="replay-icon-button"
            disabled={replayIndex <= 0 || hasPaperActivity}
            onClick={() => onStepReplay(-1)}
            title="Previous candle"
          >
            Back
          </button>
          <button
            type="button"
            className="replay-play-button"
            disabled={totalCandles === 0 || replayIndex >= totalCandles - 1}
            onClick={onToggleReplay}
          >
            {isReplayPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="replay-icon-button"
            disabled={totalCandles === 0 || replayIndex >= totalCandles - 1}
            onClick={() => onStepReplay(1)}
            title="Next candle"
          >
            Next
          </button>
          <select value={replaySpeedMs} onChange={(event) => onReplaySpeedChange(Number(event.target.value))}>
            <option value={900}>0.5x</option>
            <option value={450}>1x</option>
            <option value={180}>2x</option>
            <option value={80}>5x</option>
          </select>
        </div>

        <button type="button" className="link-button replay-reset-button" onClick={onResetReplay}>
          Reset Replay
        </button>
        {hasPaperActivity && (
          <p className="input-note">Reset replay to scrub backward after placing paper trades.</p>
        )}
      </section>

      <section className="paper-section order-ticket">
        <div className="paper-section-heading">
          <h3>Order Ticket</h3>
          <span>{(commissionRate * 100).toFixed(2)}% fee</span>
        </div>

        <label className="field-label">
          Amount
          <div className="money-input">
            <span>$</span>
            <input
              type="number"
              min="1"
              max={balance}
              value={orderAmount}
              disabled={!!position}
              onChange={(event) => setOrderAmount(event.target.value)}
            />
          </div>
        </label>

        <div className="preset-row">
          {[25, 50, 75, 100].map((percent) => (
            <button
              key={percent}
              type="button"
              className="ghost-button"
              disabled={!!position || balance <= 0}
              onClick={() => setOrderAmount(((balance * percent) / 100).toFixed(0))}
            >
              {percent}%
            </button>
          ))}
        </div>

        <div className="order-preview">
          <span>Est. quantity</span>
          <strong>{estimatedQuantity.toFixed(6)} {baseAsset}</strong>
          <span>Est. entry fee</span>
          <strong>{formatCurrency(estimatedEntryFee)}</strong>
        </div>

        <div className="paper-actions">
          <button
            type="button"
            className="buy-button"
            disabled={!orderAmountIsValid || !!position || currentPrice <= 0}
            onClick={handleBuyClick}
          >
            Buy Long
          </button>
          <button type="button" className="sell-button" disabled={!position} onClick={onSell}>
            Close
          </button>
        </div>

        {!orderAmountIsValid && !position && (
          <p className="input-note">Enter an amount between $1 and available cash.</p>
        )}
      </section>

      <section className="paper-section">
        <div className="paper-section-heading">
          <h3>Open Position</h3>
          <span>{position ? 'Long' : 'Flat'}</span>
        </div>

        {position ? (
          <div className="position-grid">
            <Metric label="Entry" value={formatCurrency(position.entryPrice)} />
            <Metric label="Size" value={`${position.amountCrypto.toFixed(5)} ${baseAsset}`} />
            <Metric label="Cost" value={formatCurrency(position.costUsd)} />
            <Metric label="Est. Exit Fee" value={formatCurrency(estimatedExitFee)} />
            <Metric
              label="Unrealized"
              value={`${formatSignedCurrency(unrealizedPnl)} (${unrealizedPnlPct.toFixed(2)}%)`}
              tone={unrealizedPnl >= 0 ? 'good' : 'bad'}
            />
          </div>
        ) : (
          <p className="empty-state">No open position.</p>
        )}
      </section>

      <section className="paper-section paper-history">
        <div className="paper-section-heading">
          <h3>Trade Ledger</h3>
          <button type="button" className="link-button" onClick={onResetAccount}>
            Reset
          </button>
        </div>

        <div className="paper-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Side</th>
                <th>Time</th>
                <th>Price</th>
                <th>Fee</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={5}>No paper trades yet.</td>
                </tr>
              ) : (
                trades.map((trade) => (
                  <tr key={trade.id}>
                    <td>
                      <span className={`side-pill side-pill-${trade.type.toLowerCase()}`}>
                        {trade.type}
                      </span>
                    </td>
                    <td>{formatTime(trade.time)}</td>
                    <td>{formatCurrency(trade.price)}</td>
                    <td>{formatCurrency(trade.fee)}</td>
                    <td className={trade.pnl === undefined ? undefined : trade.pnl >= 0 ? 'positive' : 'negative'}>
                      {trade.pnl === undefined ? '-' : formatSignedCurrency(trade.pnl)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </aside>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="paper-metric">
      <span>{label}</span>
      <strong className={tone === 'good' ? 'positive' : tone === 'bad' ? 'negative' : undefined}>
        {value}
      </strong>
    </div>
  );
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

function formatTime(time: number): string {
  return new Date(time * 1000).toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function formatFullTime(time: number): string {
  return new Date(time * 1000).toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
