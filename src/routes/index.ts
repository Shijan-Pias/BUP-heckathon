import { Router } from 'express';
import { healthRouter } from './health.route';
import { optimizeRouter } from './optimize.route';

const router = Router();

router.use('/health', healthRouter);
router.use('/optimize-energy', optimizeRouter);

export default router;
