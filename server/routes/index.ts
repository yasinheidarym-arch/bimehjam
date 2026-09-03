import { Router } from 'express';
import authRoutes from './authRoutes';
import customerRoutes from './customerRoutes';
import conversationRoutes from './conversationRoutes';
import leadRoutes from './leadRoutes';
import dashboardRoutes from './dashboardRoutes';
import webhookRoutes from './webhookRoutes';
import aiRoutes from './aiRoutes';
import knowledgeRoutes from './knowledgeRoutes';
import quotationWorkflowRoutes from './quotationWorkflowRoutes';
import automationRoutes from './automationRoutes';
import { getOperatorsStatus } from '../controllers/dashboardController';
import {
  getSettingsController,
  updateSettingController,
  getAiResponsePoliciesController,
  updateAiResponsePolicyController
} from '../controllers/settingController';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { getTaskSmsSettings, updateTaskSmsSettings } from '../controllers/taskSmsController';

const router = Router();

/*
 * ============================================================
 * PUBLIC ROUTES
 * ============================================================
 */

/*
 * Authentication routes handle their own protection:
 * - POST /login      -> public
 * - POST /register   -> ADMIN only
 * - GET  /me         -> authenticated
 * - GET  /users      -> authenticated
 */
router.use('/auth', authRoutes);

/*
 * Goftino webhook must remain public because Goftino
 * cannot send our JWT token.
 */
router.use('/webhook', webhookRoutes);
router.use('/webhooks', webhookRoutes);

/*
 * Health check must remain public.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Bimeh Jam AI Insurance Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: 'SQLite (Prisma ORM)',
    environment: process.env.NODE_ENV || 'development',
  });
});

/*
 * ============================================================
 * PROTECTED ROUTES
 * ============================================================
 *
 * Everything below requires:
 *
 * Authorization: Bearer <JWT>
 *
 * If the token is missing/invalid/expired,
 * authenticateToken returns 401/403.
 */

router.use('/customers', authenticateToken, customerRoutes);
router.use('/conversations', authenticateToken, conversationRoutes);
router.use('/leads', authenticateToken, leadRoutes);
router.use('/dashboard', authenticateToken, dashboardRoutes);
router.use('/ai', authenticateToken, aiRoutes);
router.use('/knowledge', authenticateToken, knowledgeRoutes);
router.use('/', authenticateToken, quotationWorkflowRoutes);
router.use('/', authenticateToken, automationRoutes);

/*
 * Settings routes
 */
router.get('/settings', authenticateToken, getSettingsController);
router.post('/settings', authenticateToken, updateSettingController);
router.get('/settings/task-sms', authenticateToken, getTaskSmsSettings);
router.put('/settings/task-sms', authenticateToken, requireRole(['ADMIN']), updateTaskSmsSettings);

router.get(
  '/settings/ai-response-policies',
  authenticateToken,
  getAiResponsePoliciesController
);

router.put(
  '/settings/ai-response-policies/:id',
  authenticateToken,
  updateAiResponsePolicyController
);

router.get(
  '/settings/ai-config',
  authenticateToken,
  (req, res) =>
    import('../controllers/settingController').then(c =>
      c.getAiConfigController(req, res)
    )
);

router.post(
  '/settings/ai-config',
  authenticateToken,
  (req, res) =>
    import('../controllers/settingController').then(c =>
      c.updateAiConfigController(req, res)
    )
);

router.put(
  '/settings/ai-config',
  authenticateToken,
  (req, res) =>
    import('../controllers/settingController').then(c =>
      c.updateAiConfigController(req, res)
    )
);

router.post(
  '/settings/ai-test',
  authenticateToken,
  (req, res) =>
    import('../controllers/settingController').then(c =>
      c.testAiConnectionController(req, res)
    )
);

/*
 * Operator status
 */
router.get(
  '/operators/status',
  authenticateToken,
  getOperatorsStatus
);

export default router;
