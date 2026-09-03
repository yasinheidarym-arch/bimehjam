import prisma from '../db/client';
import { dispatchTaskCreatedSms } from './fastNotifySmsService';

export async function createSystemTask(data: {
  customerId?: string;
  leadId?: string;
  conversationId?: string;
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  assignedUser?: string;
  assignedUserId?: string;
}) {

  const task = await prisma.task.create({
    data: {
      customerId: data.customerId || null,
      leadId: data.leadId || null,
      conversationId: data.conversationId || null,

      assignedUser: data.assignedUser || 'کارشناس فروش',
      assignedUserId: data.assignedUserId || null,

      title: data.title,
      description: data.description || null,

      type: data.type || 'Call Customer',

      priority: data.priority || 'MEDIUM',

      status: 'New',

      source: 'AI',

      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  await dispatchTaskCreatedSms(task);


  await prisma.notification.create({
    data: {
      type: 'Task Deadline',
      title: `وظیفه جدید: ${task.title}`,
      description: task.description || '',
      priority: task.priority,
      customerId: task.customerId,
      conversationId: task.conversationId,
      leadId: task.leadId
    }
  });


  return task;
}
