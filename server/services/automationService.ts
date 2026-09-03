import prisma from '../db/client';
import { GoogleGenAI } from '@google/genai';
import { dispatchTaskCreatedSms } from './fastNotifySmsService';
import { assertActiveTaskType } from './taskTypeCatalogService';

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Seed Default Automation Rules if none exist
 */
export async function seedDefaultAutomationRules() {
  const count = await prisma.automationRule.count();
  if (count > 0) return;

  const defaultRules = [
    {
      name: 'پیگیری فوری برای لیدهای داغ (امتیاز > ۸۰)',
      event: 'LEAD_HOT',
      condition: JSON.stringify({ scoreGt: 80 }),
      action: 'CREATE_TASK',
      actionPayload: JSON.stringify({
        taskTitle: 'تماس فوری با لید داغ و آماده خرید',
        taskType: 'Call Customer',
        priority: 'URGENT',
        assignedUser: 'کارشناس ارشد فروش',
      }),
      active: true,
    },
    {
      name: 'پیگیری استعلام قیمت صادرشده بدون پاسخ (۳ روز)',
      event: 'QUOTATION_SENT_INACTIVE',
      condition: JSON.stringify({ inactiveDays: 3 }),
      action: 'CREATE_TASK',
      actionPayload: JSON.stringify({
        taskTitle: 'پیگیری پیشنهاد و استعلام قیمت ارسال‌شده',
        taskType: 'Follow Up Quote',
        priority: 'HIGH',
        assignedUser: 'کارشناس بیمه',
      }),
      active: true,
    },
    {
      name: 'ارسال اعلان فوری به کارشناس هنگام شروع گفتگوی جدید',
      event: 'CONVERSATION_NEW',
      condition: JSON.stringify({}),
      action: 'SEND_NOTIFICATION',
      actionPayload: JSON.stringify({
        title: 'گفتگوی جدید با مشتری در گفتینو',
        type: 'New Conversation',
        priority: 'HIGH',
      }),
      active: true,
    },
    {
      name: 'تعریف وظیفه تماس تعاملی برای مشتریان غیرفعال (۷ روز)',
      event: 'CUSTOMER_INACTIVE',
      condition: JSON.stringify({ inactiveDays: 7 }),
      action: 'CREATE_TASK',
      actionPayload: JSON.stringify({
        taskTitle: 'تماس یا ارسال پیام تعاملی به مشتری پیگیر',
        taskType: 'Send Message',
        priority: 'MEDIUM',
        assignedUser: 'پشتیبانی',
      }),
      active: true,
    },
    {
      name: 'تغییر وضعیت لید به QUALIFIED پس از تکمیل استعلام',
      event: 'QUOTATION_COMPLETED',
      condition: JSON.stringify({}),
      action: 'CHANGE_LEAD_STATUS',
      actionPayload: JSON.stringify({
        status: 'QUALIFIED',
        taskTitle: 'بررسی مدارک و نهایی‌سازی صدور بیمه‌نامه',
      }),
      active: true,
    },
  ];

  for (const r of defaultRules) {
    await prisma.automationRule.create({ data: r });
  }
}

/**
 * Trigger Automation Event Engine
 */
export async function triggerAutomationEvent(
  eventName: string,
  eventData: {
    customerId?: string;
    leadId?: string;
    conversationId?: string;
    score?: number;
    inactiveDays?: number;
    notes?: string;
    [key: string]: any;
  }
) {
  await seedDefaultAutomationRules();

  const rules = await prisma.automationRule.findMany({
    where: {
      event: eventName,
      active: true,
    },
  });

  const results = [];

  for (const rule of rules) {
    try {
      let isEligible = true;
      let condObj: any = {};
      try {
        condObj = JSON.parse(rule.condition || '{}');
      } catch {
        condObj = {};
      }

      // Check conditions
      if (condObj.scoreGt !== undefined && (eventData.score === undefined || eventData.score <= condObj.scoreGt)) {
        isEligible = false;
      }
      if (
        condObj.inactiveDays !== undefined &&
        (eventData.inactiveDays === undefined || eventData.inactiveDays < condObj.inactiveDays)
      ) {
        isEligible = false;
      }

      if (!isEligible) continue;

      let payloadObj: any = {};
      try {
        payloadObj = JSON.parse(rule.actionPayload || '{}');
      } catch {
        payloadObj = {};
      }

      let executionDetail = '';

      // Perform Action
      if (rule.action === 'CREATE_TASK') {
        const task = await prisma.task.create({
          data: {
            customerId: eventData.customerId || null,
            leadId: eventData.leadId || null,
            conversationId: eventData.conversationId || null,
            assignedUser: payloadObj.assignedUser || 'کارشناس فروش',
            title: payloadObj.taskTitle || 'پیگیری سیستم هوشمند',
            description: eventData.notes || payloadObj.description || 'ایجادشده به‌صورت خودکار بر اساس قوانین اتوماسیون',
            type: await assertActiveTaskType(payloadObj.taskType),
            priority: payloadObj.priority || 'HIGH',
            status: 'New',
            source: 'Automation Rule',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24h
          },
        });
        await dispatchTaskCreatedSms(task);

        // Also create a notification for task creation
        await prisma.notification.create({
          data: {
            type: 'Task Deadline',
            title: `وظیفه جدید: ${task.title}`,
            description: task.description,
            priority: task.priority,
            customerId: task.customerId,
            conversationId: task.conversationId,
            leadId: task.leadId,
          },
        });

        executionDetail = `وظیفه #${task.id} ایجاد شد: ${task.title}`;
      } else if (rule.action === 'SEND_NOTIFICATION') {
        const notif = await prisma.notification.create({
          data: {
            type: payloadObj.type || 'Follow Up Required',
            title: payloadObj.title || 'اعلان جدید اتوماسیون',
            description: eventData.notes || payloadObj.description || 'رویداد اتوماسیون ثبت شد',
            priority: payloadObj.priority || 'MEDIUM',
            customerId: eventData.customerId || null,
            conversationId: eventData.conversationId || null,
            leadId: eventData.leadId || null,
          },
        });
        executionDetail = `اعلان #${notif.id} ارسال شد: ${notif.title}`;
      } else if (rule.action === 'CHANGE_LEAD_STATUS' && eventData.leadId) {
        await prisma.lead.update({
          where: { id: eventData.leadId },
          data: { status: payloadObj.status || 'QUALIFIED' },
        });
        executionDetail = `وضعیت لید #${eventData.leadId} به ${payloadObj.status} تغییر یافت`;
      } else if (rule.action === 'ASSIGN_EXPERT' && eventData.customerId) {
        await prisma.customer.update({
          where: { id: eventData.customerId },
          data: { assignedOperator: payloadObj.expertName || null },
        });
        executionDetail = `کارشناس ${payloadObj.expertName} به مشتری اختصاص داده شد`;
      }

      // Log execution
      await prisma.automationExecution.create({
        data: {
          ruleId: rule.id,
          eventData: JSON.stringify(eventData),
          status: 'SUCCESS',
          details: executionDetail,
        },
      });

      results.push({ ruleId: rule.id, status: 'SUCCESS', details: executionDetail });
    } catch (err: any) {
      await prisma.automationExecution.create({
        data: {
          ruleId: rule.id,
          eventData: JSON.stringify(eventData),
          status: 'FAILED',
          details: err.message,
        },
      });
      results.push({ ruleId: rule.id, status: 'FAILED', error: err.message });
    }
  }

  return results;
}

/**
 * Generate Smart Follow-up Recommendations using Gemini AI
 */
export async function getSmartFollowUpSuggestions(params: {
  customerId?: string;
  leadId?: string;
  conversationId?: string;
}) {
  let contextText = '';

  if (params.customerId) {
    const cust = await prisma.customer.findUnique({
      where: { id: params.customerId },
      include: {
        leads: true,
        conversations: { take: 3, orderBy: { createdAt: 'desc' } },
        tasks: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    if (cust) {
      contextText += `مشتری: ${cust.name} | امتیاز لید: ${cust.leadScore} | وضعیت: ${cust.leadStatus}\n`;
      contextText += `آخرین فعالیت: ${cust.lastActivity || 'نامشخص'}\n`;
      if (cust.leads.length > 0) {
        contextText += `لیدها: ${cust.leads.map((l) => `${l.insuranceType} (${l.status})`).join(', ')}\n`;
      }
    }
  }

  if (params.conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: params.conversationId },
      include: { messages: { take: 8, orderBy: { createdAt: 'desc' } } },
    });
    if (conv && conv.messages.length > 0) {
      contextText += `پیام‌های اخیر گفتگوی مشتری:\n${conv.messages
        .reverse()
        .map((m) => `${m.sender}: ${m.content}`)
        .join('\n')}\n`;
    }
  }

  if (!ai || !contextText) {
    return [
      {
        action: 'Call Customer',
        title: 'تماس تلفنی جهت بررسی نیاز بیمه‌ای مشتری',
        reason: 'بر اساس آخرین استعلام مشتری و عدم نهایی‌سازی صدور',
        urgency: 'HIGH',
      },
      {
        action: 'Send Message',
        title: 'ارسال جدول مقایسه پوشش‌ها و فرانشیز',
        reason: 'افزایش شفافیت و رفع ابهام احتمالی مشتری',
        urgency: 'MEDIUM',
      },
      {
        action: 'Offer Related Product',
        title: 'پیشنهاد بیمه مکمل بدنه یا آتش‌سوزی',
        reason: 'فرصت فروش مکمل (Cross-sell) بر اساس سابقه مشتری',
        urgency: 'LOW',
      },
    ];
  }

  try {
    const prompt = `شما یک دستیار هوشمند اتوماسیون فروش بیمه (Bimeh Jam AI) هستید.
بر اساس سابقه و داده‌های زیر از وضعیت مشتری:

${contextText}

لطفاً ۳ پیشنهاد دقیق، هوشمندانه و کاربردی برای کارشناس فروش تولید کنید.
اقدامات ممکن: Call Customer, Send Message, Provide Info, Offer Related Product, Wait.

خروجی باید به صورت آرایه JSON معتبر با ساختار زیر باشد و هیچ متن اضافه‌ای نداشته باشد:
[
  {
    "action": "Call Customer",
    "title": "عنوان اقدام پیشنهادی",
    "reason": "علت و تحلیل پیش‌بینی هوش مصنوعی",
    "urgency": "HIGH"
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Error generating smart follow up suggestions:', error);
    return [
      {
        action: 'Call Customer',
        title: 'تماس تلفنی جهت بررسی نیاز بیمه‌ای مشتری',
        reason: 'بر اساس تحلیل هوشمند سوابق گفتگوی مشتری',
        urgency: 'HIGH',
      },
    ];
  }
}
