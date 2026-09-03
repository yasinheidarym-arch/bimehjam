import { Request, Response } from 'express';
import prisma from '../db/client';
import { seedDefaultAutomationRules, triggerAutomationEvent } from '../services/automationService';
import { assertActiveTaskType } from '../services/taskTypeCatalogService';

export async function getRules(req: Request, res: Response) {
  try {
    await seedDefaultAutomationRules();
    const rules = await prisma.automationRule.findMany({
      include: {
        executions: {
          take: 5,
          orderBy: { executedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, count: rules.length, data: rules });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createRule(req: Request, res: Response) {
  try {
    const { name, event, condition, action, actionPayload, active } = req.body;

    if (!name || !event || !action) {
      return res.status(400).json({ success: false, error: 'نام، رویداد و اقدام الزامی هستند' });
    }
    if (action === 'CREATE_TASK') {
      const payload = typeof actionPayload === 'string' ? JSON.parse(actionPayload || '{}') : actionPayload || {};
      await assertActiveTaskType(payload.taskType);
    }

    const rule = await prisma.automationRule.create({
      data: {
        name,
        event,
        condition: typeof condition === 'string' ? condition : JSON.stringify(condition || {}),
        action,
        actionPayload: typeof actionPayload === 'string' ? actionPayload : JSON.stringify(actionPayload || {}),
        active: active !== undefined ? active : true,
      },
    });

    return res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateRule(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, event, condition, action, actionPayload, active } = req.body;

    const dataToUpdate: any = {};
    if (action === 'CREATE_TASK' && actionPayload !== undefined) {
      const payload = typeof actionPayload === 'string' ? JSON.parse(actionPayload || '{}') : actionPayload || {};
      await assertActiveTaskType(payload.taskType);
    }
    if (name) dataToUpdate.name = name;
    if (event) dataToUpdate.event = event;
    if (condition !== undefined) {
      dataToUpdate.condition = typeof condition === 'string' ? condition : JSON.stringify(condition);
    }
    if (action) dataToUpdate.action = action;
    if (actionPayload !== undefined) {
      dataToUpdate.actionPayload = typeof actionPayload === 'string' ? actionPayload : JSON.stringify(actionPayload);
    }
    if (active !== undefined) dataToUpdate.active = active;

    const rule = await prisma.automationRule.update({
      where: { id },
      data: dataToUpdate,
    });

    return res.status(200).json({ success: true, data: rule });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteRule(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.automationRule.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'قانون اتوماسیون با موفقیت حذف شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function triggerEvent(req: Request, res: Response) {
  try {
    const { eventName, eventData } = req.body;
    if (!eventName) {
      return res.status(400).json({ success: false, error: 'نام رویداد الزامی است' });
    }

    const results = await triggerAutomationEvent(eventName, eventData || {});
    return res.status(200).json({ success: true, data: results });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getExecutions(req: Request, res: Response) {
  try {
    const executions = await prisma.automationExecution.findMany({
      include: {
        rule: { select: { id: true, name: true, event: true, action: true } },
      },
      orderBy: { executedAt: 'desc' },
      take: 50,
    });
    return res.status(200).json({ success: true, count: executions.length, data: executions });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
