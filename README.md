# Crypto Backtester

Production-quality MVP for a crypto strategy backtesting platform similar to TradingView Strategy Tester.

## Tech Stack

- Frontend: React, TypeScript, Vite, Lightweight Charts, Monaco Editor, Axios
- Backend: Node.js, Express, TypeScript
- Data: CSV files, no database

## Current Step

Step 1 creates the project scaffold only. API routes, CSV loading, chart rendering, editor, and backtest engine will be added in later steps.

## Run Commands

Install dependencies:

```bash
cd crypto-backtester
npm install
npm install --prefix backend
npm install --prefix frontend
```

Run frontend and backend together:

```bash
npm run dev
```

Or run separately:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

Backend defaults to `http://localhost:4100`. Frontend defaults to `http://localhost:5173`, or the next free Vite port if `5173` is already busy.
