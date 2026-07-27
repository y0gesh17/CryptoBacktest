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

apiRoutes.get('/history', async (req, res, next) => {
  try {
    const symbol = String(req.query.symbol ?? 'BTCUSDT');
    const timeframe = String(req.query.timeframe ?? '1h').toLowerCase();
    const candles = await getHistory(symbol, timeframe);

    res.json(candles);
  } catch (error) {
    next(error);
  }
});

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
