import { Request, Response } from 'express';
import prisma from '../db/client';
import { getSmartFollowUpSuggestions } from '../services/automationService';
import { dispatchTaskCreatedSms } from '../services/fastNotifySmsService';
import { assertActiveTaskType } from '../services/taskTypeCatalogService';

export async function getTasks(req: Request, res: Response) {
  try {
    const { status, priority, type, source, customerId } = req.query;

    const where: any = {};
    if (status && status !== 'ALL') where.status = String(status);
    if (priority && priority !== 'ALL') where.priority = String(priority);
    if (type && type !== 'ALL') where.type = String(type);
    if (source && source !== 'ALL') where.source = String(source);
    if (customerId) where.customerId = String(customerId);

    const tasks = await prisma.task.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, avatar: true } },
        lead: { select: { id: true, insuranceType: true, score: true, status: true } },
        conversation: { select: { id: true, status: true, lastMessage: true } },
        assignedUserRecord: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, count: tasks.length, data: tasks });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createTask(req: Request, res: Response) {
  try {
    const {
      customerId,
      leadId,
      conversationId,
      assignedUser,
      assignedUserId,
      title,
      description,
      type,
      priority,
      dueDate,
      source,
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'عنوان وظیفه الزامی است' });
    }

    const selectedUser = assignedUserId ? await prisma.user.findFirst({
      where: { id: String(assignedUserId), role: { in: ['ADMIN', 'OPERATOR'] } },
      select: { id: true, name: true },
    }) : null;
    if (assignedUserId && !selectedUser) {
      return res.status(400).json({ success: false, error: 'کاربر مسئول معتبر نیست.' });
    }
    const validatedType = await assertActiveTaskType(type);
    const task = await prisma.task.create({
      data: {
        customerId: customerId || null,
        leadId: leadId || null,
        conversationId: conversationId || null,
        assignedUser: selectedUser?.name || assignedUser || 'کارشناس فروش',
        assignedUserId: selectedUser?.id || null,
        title,
        description: description || null,
        type: validatedType,
        priority: priority || 'MEDIUM',
        status: 'New',
        source: source || 'Operator',
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: {
        customer: true,
        lead: true,
      },
    });

    await dispatchTaskCreatedSms(task);

    // Create Notification
    await prisma.notification.create({
      data: {
        type: 'Task Deadline',
        title: `وظیفه جدید ثبت شد: ${title}`,
        description: description || 'برای شما وظیفه جدیدی تعریف شد',
        priority: task.priority,
        customerId: task.customerId,
        conversationId: task.conversationId,
        leadId: task.leadId,
      },
    });

    return res.status(201).json({ success: true, data: task });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, title, description, priority, assignedUser, assignedUserId, dueDate } = req.body;

    const dataToUpdate: any = {};
    if (status) {
      dataToUpdate.status = status;
      if (status === 'Completed') {
        dataToUpdate.completedAt = new Date();
      }
    }
    if (title) dataToUpdate.title = title;
    if (description !== undefined) dataToUpdate.description = description;
    if (priority) dataToUpdate.priority = priority;
    if (assignedUser) dataToUpdate.assignedUser = assignedUser;
    if (assignedUserId !== undefined) {
      const selectedUser = assignedUserId ? await prisma.user.findFirst({
        where: { id: String(assignedUserId), role: { in: ['ADMIN', 'OPERATOR'] } },
        select: { id: true, name: true },
      }) : null;
      if (assignedUserId && !selectedUser) {
        return res.status(400).json({ success: false, error: 'کاربر مسئول معتبر نیست.' });
      }
      dataToUpdate.assignedUserId = selectedUser?.id || null;
      if (selectedUser) dataToUpdate.assignedUser = selectedUser.name;
    }
    if (dueDate) dataToUpdate.dueDate = new Date(dueDate);

    const task = await prisma.task.update({
      where: { id },
      data: dataToUpdate,
      include: {
        customer: true,
        lead: true,
      },
    });

    return res.status(200).json({ success: true, data: task });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getSmartSuggestions(req: Request, res: Response) {
  try {
    const { customerId, leadId, conversationId } = req.query;
    const suggestions = await getSmartFollowUpSuggestions({
      customerId: customerId ? String(customerId) : undefined,
      leadId: leadId ? String(leadId) : undefined,
      conversationId: conversationId ? String(conversationId) : undefined,
    });
    return res.status(200).json({ success: true, data: suggestions });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
