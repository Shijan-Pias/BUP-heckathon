import { Router, Request, Response } from 'express';
import { OptimizeEnergyRequestSchema } from '../schemas/request.schema';
import { PipelineService } from '../services/pipeline.service';

const router = Router();
const pipelineService = new PipelineService();

router.post('/', async (req: Request, res: Response) => {
  // 1. Validate request schema
  const parseResult = OptimizeEnergyRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request schema',
      details: parseResult.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  try {
    const result = await pipelineService.processScenario(parseResult.data);
    return res.status(200).json(result);
  } catch (error) {
    const message = (error as Error).message || 'Failed to process energy optimization scenario.';
    return res.status(500).json({
      error: 'Optimization processing error',
      message,
    });
  }
});

export const optimizeRouter = router;
