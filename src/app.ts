import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Mount API endpoints
  app.use('/', routes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const isSyntaxError = err instanceof SyntaxError && 'body' in err;
    if (isSyntaxError) {
      return res.status(400).json({ error: 'Malformed JSON payload' });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your request.',
    });
  });

  return app;
}
