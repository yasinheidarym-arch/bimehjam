import { Router } from 'express';
import {
  getTasks,
  createTask,
  updateTask,
  getSmartSuggestions,
} from '../controllers/taskController';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '../controllers/notificationController';
import {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  triggerEvent,
  getExecutions,
} from '../controllers/automationController';
import { createTaskType, deleteTaskType, editTaskType, listTaskTypes, restoreArchivedTaskType } from '../controllers/taskTypeController';
import { requireRole } from '../middleware/auth';

const router = Router();

// Tasks API
router.get('/tasks', getTasks);
router.post('/tasks', createTask);
router.patch('/tasks/:id', updateTask);
router.get('/tasks/smart-suggestions', getSmartSuggestions);
router.get('/task-types', listTaskTypes);
router.post('/task-types', requireRole(['ADMIN']), createTaskType);
router.put('/task-types/:id', requireRole(['ADMIN']), editTaskType);
router.post('/task-types/:id/restore', requireRole(['ADMIN']), restoreArchivedTaskType);
router.delete('/task-types/:id', requireRole(['ADMIN']), deleteTaskType);

// Notifications API
router.get('/notifications', getNotifications);
router.patch('/notifications/read-all', markAllAsRead);
router.patch('/notifications/:id/read', markAsRead);

// Automation Rules API
router.get('/automation-rules', getRules);
router.post('/automation-rules', createRule);
router.put('/automation-rules/:id', updateRule);
router.delete('/automation-rules/:id', deleteRule);
router.post('/automation-rules/trigger', triggerEvent);
router.get('/automation-rules/executions', getExecutions);

export default router;
