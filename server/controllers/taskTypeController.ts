import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { addTaskType, getManagedTaskTypeCatalog, getTaskTypeCatalog, removeOrArchiveTaskType, restoreTaskType, updateTaskType } from '../services/taskTypeCatalogService';

export async function listTaskTypes(req: AuthRequest, res: Response) {
  try {
    const includeArchived = req.query.includeArchived === 'true' && req.user?.role === 'ADMIN';
    return res.json({ success: true, data: includeArchived ? await getManagedTaskTypeCatalog() : await getTaskTypeCatalog() });
  } catch { return res.status(500).json({ success: false, error: 'دریافت انواع وظیفه ناموفق بود.' }); }
}

export async function restoreArchivedTaskType(req: AuthRequest, res: Response) {
  try { return res.json({ success: true, data: await restoreTaskType(req.params.id) }); }
  catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'بازگردانی نوع وظیفه ناموفق بود.' }); }
}

export async function createTaskType(req: AuthRequest, res: Response) {
  try { return res.status(201).json({ success: true, data: await addTaskType(req.body?.label, req.body?.smsTemplate) }); }
  catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'ثبت نوع وظیفه ناموفق بود.' }); }
}

export async function editTaskType(req: AuthRequest, res: Response) {
  try { return res.json({ success: true, data: await updateTaskType(req.params.id, req.body || {}) }); }
  catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'ویرایش نوع وظیفه ناموفق بود.' }); }
}

export async function deleteTaskType(req: AuthRequest, res: Response) {
  try { return res.json({ success: true, data: await removeOrArchiveTaskType(req.params.id) }); }
  catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'حذف نوع وظیفه ناموفق بود.' }); }
}
