import type { BacktestMetrics, Trade } from '../types/market';

interface ResultsPanelProps {
  metrics: BacktestMetrics | null;
  trades: Trade[];
}

export function ResultsPanel({ metrics, trades }: ResultsPanelProps) {
  return (
    <section className="panel results-panel">
      <div className="metrics-grid">
        <Metric label="Final Equity" value={metrics ? currency(metrics.finalEquity) : '-'} />
        <Metric label="Net PnL" value={metrics ? currency(metrics.netPnl) : '-'} tone={metrics && metrics.netPnl >= 0 ? 'good' : 'bad'} />
        <Metric label="Return" value={metrics ? `${metrics.totalReturnPct}%` : '-'} />
        <Metric label="Trades" value={metrics ? String(metrics.totalTrades) : '-'} />
        <Metric label="Win Rate" value={metrics ? `${metrics.winRatePct}%` : '-'} />
        <Metric label="Max Drawdown" value={metrics ? `${metrics.maxDrawdownPct}%` : '-'} tone="bad" />
      </div>

      <div className="trade-table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Entry Price</th>
              <th>Exit Price</th>
              <th>Reason</th>
              <th>PnL</th>
              <th>Bars</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={8}>Run a strategy to see trades.</td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{trade.id}</td>
                  <td>{formatTime(trade.entryTime)}</td>
                  <td>{formatTime(trade.exitTime)}</td>
                  <td>{currency(trade.entryPrice)}</td>
                  <td>{currency(trade.exitPrice)}</td>
                  <td>
                    <span className={`exit-reason exit-reason-${trade.exitReason.toLowerCase()}`}>
                      {formatExitReason(trade.exitReason)}
                    </span>
                  </td>
                  <td className={trade.netPnl >= 0 ? 'positive' : 'negative'}>{currency(trade.netPnl)}</td>
                  <td>{trade.holdingBars}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
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
    <div className="metric">
      <span>{label}</span>
      <strong className={tone === 'good' ? 'positive' : tone === 'bad' ? 'negative' : undefined}>
        {value}
      </strong>
    </div>
  );
}

function currency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

function formatTime(time: number): string {
  return new Date(time * 1000).toLocaleString();
}

function formatExitReason(reason: Trade['exitReason']): string {
  const labels: Record<Trade['exitReason'], string> = {
    SELL: 'Sell',
    TAKE_PROFIT: 'TP Hit',
    STOP_LOSS: 'SL Hit',
    END_OF_TEST: 'End',
  };

  return labels[reason];
}
