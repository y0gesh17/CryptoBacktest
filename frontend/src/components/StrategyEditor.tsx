import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';

import type { SymbolCode, Timeframe } from '../types/market';

interface StrategyEditorProps {
  symbol: SymbolCode;
  timeframe: Timeframe;
  value: string;
  onChange: (value: string) => void;
}

export function StrategyEditor({ symbol, timeframe, value, onChange }: StrategyEditorProps) {
  const [copied, setCopied] = useState(false);
  const llmPrompt = useMemo(() => createStrategyPrompt(symbol, timeframe), [symbol, timeframe]);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(llmPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <h2>Strategy Code</h2>
        <button className="secondary-button" type="button" onClick={handleCopyPrompt}>
          {copied ? 'Copied' : 'Copy LLM Prompt'}
        </button>
      </div>
      <details className="prompt-box">
        <summary>LLM Strategy Prompt</summary>
        <textarea readOnly value={llmPrompt} />
      </details>
      <Editor
        defaultLanguage="javascript"
        height="100%"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
        theme="vs-dark"
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? '')}
      />
    </section>
  );
}

function createStrategyPrompt(symbol: SymbolCode, timeframe: Timeframe): string {
  return `You are an expert quantitative trading strategist and JavaScript developer.

Create a JavaScript strategy for a crypto backtesting sandbox.

Market:
- Symbol: ${symbol}
- Timeframe: ${timeframe}
- Asset type: crypto perpetual/spot style OHLCV candles

The code you return will run once per candle from oldest to newest.

IMPORTANT OUTPUT RULES:
- Return ONLY executable JavaScript code.
- Do not use markdown.
- Do not wrap the answer in code fences.
- Do not include imports, require(), fetch(), async/await, setTimeout, DOM APIs, or external libraries.
- Do not define a full application.
- Do not return JSON.
- The code must use the sandbox API below and call buy() / sell() when conditions trigger.
- Keep the code deterministic and readable.

Sandbox variables available on every candle:
- candle: current candle object: { time, open, high, low, close, volume }
- candles: full array of candle objects
- index: current candle index
- position: current open long position object, or null
- state: persistent object that survives across candles for counters, arrays, flags, previous values, and smoothed values

Sandbox functions:
- buy(): open one long position at current candle close
- buy({ takeProfitPct: 6, stopLossPct: 3 }): open long and attach automatic take-profit / stop-loss levels using percentages from entry price
- sell(): close the open long position at current candle close
- sma(period): simple moving average of close prices ending at current candle
- sma(period, source): simple moving average using source "open", "high", "low", "close", or "volume"

Backtest engine behavior:
- Long-only.
- Only one open position is allowed.
- New buy() calls are ignored when already long.
- sell() calls are ignored when no position is open.
- If a position has takeProfitPct, it exits when candle.high reaches the take-profit price.
- If a position has stopLossPct, it exits when candle.low reaches the stop-loss price.
- If both TP and SL are touched in the same candle, stop loss is handled first as a conservative assumption.
- TP/SL checks start from candles after entry, because entries happen at candle close.
- Chart markers label automatic exits as "TP HIT" or "SL HIT".
- Trade history includes exitReason: SELL, TAKE_PROFIT, STOP_LOSS, or END_OF_TEST.
- Commission is charged by the backtest engine.
- The strategy does not need to calculate PnL.

Strategy requirements:
- Include clear comments explaining the idea.
- Avoid trading until enough candles exist for indicators.
- Use position checks before buy/sell when possible.
- Include both entry and exit rules.
- Prefer buy({ takeProfitPct, stopLossPct }) when the strategy should manage risk automatically.
- If the strategy needs memory between candles, use state fields. Example: state.barCounter = (state.barCounter ?? 0) + 1.
- Do not rely on var/let/const globals to persist between candles.
- Prefer robust logic over overfitting.
- Make the strategy suitable for ${symbol} on ${timeframe}.

Generate one complete strategy now.`;
}
