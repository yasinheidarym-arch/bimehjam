import { Router } from 'express';
import { getAiLogs, getAiLogStats, retryGoftinoSend, triggerAiPipelineManually, getBrainLogs, getBrainStats } from '../controllers/aiLogController';
import {
  getAiModeController,
  setAiModeController,
  getAiConfigController,
  updateAiConfigController,
  testAiConnectionController,
  updateAiScheduleController,
} from '../controllers/settingController';
import { requireRole } from '../middleware/auth';

const router = Router();

router.get('/mode', getAiModeController);
router.post('/mode', setAiModeController);
router.put('/schedule', requireRole(['ADMIN']), updateAiScheduleController);
router.get('/config', getAiConfigController);
router.post('/config', updateAiConfigController);
router.put('/config', updateAiConfigController);
router.post('/test-connection', testAiConnectionController);
router.get('/logs', getAiLogs);
router.get('/logs/stats', getAiLogStats);
router.get('/brain-logs', getBrainLogs);
router.get('/brain-stats', getBrainStats);
router.post('/retry-goftino', retryGoftinoSend);
router.post('/trigger', triggerAiPipelineManually);

export default router;

