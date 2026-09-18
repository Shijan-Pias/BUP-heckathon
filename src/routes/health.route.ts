import { Router, Request, Response } from 'express';
import { HealthResponse } from '../types/api';

const router = Router();

router.get('/', (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json({ status: 'ok' });
});

export const healthRouter = router;
