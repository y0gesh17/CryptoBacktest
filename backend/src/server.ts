import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';

import { apiRoutes } from './routes/apiRoutes.js';

const app = express();
const port = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', apiRoutes);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';

  res.status(400).json({ error: message });
};

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
