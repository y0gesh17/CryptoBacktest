import { Router } from 'express';

import { runBacktest } from '../engine/backtestEngine.js';
import { getHistory, getSymbols, getTimeframes } from '../services/marketDataService.js';

export const apiRoutes = Router();

apiRoutes.get('/symbols', (_req, res) => {
  res.json(getSymbols());
});

apiRoutes.get('/timeframes', (_req, res) => {
  res.json(getTimeframes());
});

// GET /api/history?symbol=ETHUSDT&timeframe=1h&limit=300
// GET /api/history?symbol=ETHUSDT&timeframe=1h&before=1704067200&limit=300
apiRoutes.get('/history', async (req, res, next) => {
  try {
    const symbol = String(req.query.symbol ?? 'BTCUSDT');
    const timeframe = String(req.query.timeframe ?? '1h').toLowerCase();
    const before = req.query.before ? Number(req.query.before) : undefined;
    const limit = Number(req.query.limit ?? 300);

    const allCandles = await getHistory(symbol, timeframe);
    const filtered = before
      ? allCandles.filter((candle) => candle.time < before)
      : allCandles;

    res.json(filtered.slice(-limit));
  } catch (error) {
    next(error);
  }
});

// POST /api/backtest  { symbol, timeframe, strategy }
// Flow: load candles → runBacktest (compile → simulate → metrics) → JSON result
apiRoutes.post('/backtest', async (req, res, next) => {
  try {
    const { symbol = 'BTCUSDT', timeframe = '1h', strategy = '' } = req.body;
    const candles = await getHistory(String(symbol), String(timeframe).toLowerCase());
    const result = runBacktest(candles, String(strategy));

    res.json(result);
  } catch (error) {
    next(error);
  }
});
