import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`[GridWise API] Service listening at http://${HOST}:${PORT}`);
  console.log(`[GridWise API] Health endpoint ready: GET http://${HOST}:${PORT}/health`);
  console.log(`[GridWise API] Optimization endpoint ready: POST http://${HOST}:${PORT}/optimize-energy`);
});

process.on('SIGTERM', () => {
  console.log('[GridWise API] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[GridWise API] Process terminated.');
  });
});
