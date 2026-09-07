import { Request, Response } from 'express';
import prisma from '../db/client';
import { createTimelineEvent } from '../services/timelineService';
import { sendGoftinoMessage } from '../services/aiPipelineService';
import { buildConversationQuotationPresentation } from '../services/conversationQuotationPresentation';

async function loadQuestionDefinitions(productIds: Array<string | null | undefined>) {
  const ids = [...new Set(productIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, Array<{ fieldName: string; title: string; order: number }>>();
  const questions = await prisma.quotationQuestion.findMany({
    where: { productId: { in: ids } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { productId: true, fieldName: true, title: true, order: true },
  });
  const result = new Map<string, Array<{ fieldName: string; title: string; order: number }>>();
  for (const question of questions) {
    if (!question.productId) continue;
    result.set(question.productId, [...(result.get(question.productId) || []), question]);
  }
  return result;
}

// Standard conversation statuses as per architecture specification
export const VALID_CONVERSATION_STATUSES = [
  'NEW',
  'AI_CONVERSATION',
  'COLLECTING_QUOTATION_INFORMATION',
  'READY_FOR_PRICE_REQUEST',
  'WAITING_FOR_EXPERT',
  'PRICE_SENT_TO_CUSTOMER',
  'NEGOTIATION',
  'PURCHASE_REQUEST',
  'POLICY_ISSUED',
  'CLOSED',
];

export async function getConversationMessages(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ success: true, data: messages, messages });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getConversations(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = (req.query.status as string) || '';
    const search = (req.query.search as string) || '';
    const operatorId = (req.query.operatorId as string) || '';

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (operatorId) {
      where.assignedUserId = operatorId;
    }

    if (search) {
      where.OR = [
        { customer: { name: { contains: search } } },
        { customer: { phone: { contains: search } } },
        { lastMessage: { contains: search } },
        { currentProductName: { contains: search } },
      ];
    }

    const [total, rawConversations] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, city: true, avatar: true, leadScore: true, leadStatus: true },
          },
          assignedUser: {
            select: { id: true, name: true, avatar: true, email: true },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          timelineEvents: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          conversationNotes: {
            take: 3,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { messages: true, tasks: true, conversationNotes: true },
          },
        },
      }),
    ]);

    const questionDefinitions = await loadQuestionDefinitions(rawConversations.map(c => c.currentProductId));
    // Format JSON fields safely
    const conversations = rawConversations.map((c) => {
      let parsedCollectedData = {};
      let parsedRemainingQuestions = [];
      try {
        if (c.collectedData) parsedCollectedData = JSON.parse(c.collectedData);
      } catch (e) {
        parsedCollectedData = {};
      }
      try {
        if (c.remainingQuestions) parsedRemainingQuestions = JSON.parse(c.remainingQuestions);
      } catch (e) {
        parsedRemainingQuestions = [];
      }

      const quotationPresentation = buildConversationQuotationPresentation(
        parsedCollectedData,
        questionDefinitions.get(c.currentProductId || '') || [],
      );
      return {
        ...c,
        collectedData: parsedCollectedData,
        quotationCollectedFields: quotationPresentation.fields,
        quotationTechnicalData: quotationPresentation.technical,
        remainingQuestions: parsedRemainingQuestions,
      };
    });

    return res.json({
      success: true,
      data: conversations,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getConversationById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const c = await prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            customerNotes: { orderBy: { createdAt: 'desc' } },
            tasks: { orderBy: { createdAt: 'desc' } },
          },
        },
        assignedUser: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
        },
        timelineEvents: {
          orderBy: { createdAt: 'desc' },
        },
        conversationNotes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!c) {
      return res.status(404).json({ success: false, error: 'گفتگو یافت نشد' });
    }

    // Reset unread count when thread opened
    if (c.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    let parsedCollectedData = {};
    let parsedRemainingQuestions = [];
    try {
      if (c.collectedData) parsedCollectedData = JSON.parse(c.collectedData);
    } catch (e) {
      parsedCollectedData = {};
    }
    try {
      if (c.remainingQuestions) parsedRemainingQuestions = JSON.parse(c.remainingQuestions);
    } catch (e) {
      parsedRemainingQuestions = [];
    }

    const questionDefinitions = await loadQuestionDefinitions([c.currentProductId]);
    const quotationPresentation = buildConversationQuotationPresentation(
      parsedCollectedData,
      questionDefinitions.get(c.currentProductId || '') || [],
    );
    const formattedConversation = {
      ...c,
      collectedData: parsedCollectedData,
      quotationCollectedFields: quotationPresentation.fields,
      quotationTechnicalData: quotationPresentation.technical,
      remainingQuestions: parsedRemainingQuestions,
    };

    return res.json({
      success: true,
      conversation: formattedConversation,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createConversation(req: Request, res: Response) {
  try {
    const { customerId, initialMessage, assignedUserId, goftinoChatId, currentProductName } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, error: 'شناسه مشتری الزامی است.' });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ success: false, error: 'مشتری وجود ندارد.' });
    }

    const conversation = await prisma.conversation.create({
      data: {
        customerId,
        assignedUserId,
        goftinoChatId,
        status: 'NEW',
        aiStatus: 'ACTIVE',
        humanStatus: 'UNASSIGNED',
        currentProductName: currentProductName || 'بیمه عمومی',
        lastMessage: initialMessage || 'شروع گفتگوی جدید',
        lastMessageAt: new Date(),
        messages: initialMessage
          ? {
              create: {
                senderType: 'CUSTOMER',
                sender: 'customer',
                content: initialMessage,
              },
            }
          : undefined,
      },
      include: {
        customer: true,
        assignedUser: true,
      },
    });

    // Record Timeline Event
    await createTimelineEvent({
      customerId: customer.id,
      conversationId: conversation.id,
      type: 'CONVERSATION_CREATED',
      title: 'گفتگوی جدید ایجاد شد',
      description: initialMessage || 'شروع گفتگو',
      actor: 'SYSTEM',
    });

    return res.status(201).json({
      success: true,
      message: 'گفتگو ایجاد شد',
      conversation,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { content, senderType, senderId, messageType } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'متن پیام الزامی است.' });
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'گفتگو یافت نشد' });
    }

    const isOperator = senderType === 'OPERATOR' || senderType === 'operator';

    // Send operator message to Goftino
    if (isOperator && conversation.goftinoChatId) {
      const goftinoResult = await sendGoftinoMessage(
        conversation.goftinoChatId,
        content
      );

      if (!goftinoResult.success) {
        return res.status(500).json({
          success: false,
          error: `ارسال پیام به گفتینو ناموفق بود: ${goftinoResult.error}`,
        });
      }
    }

    const newMessage = await prisma.message.create({
      data: {
        conversationId: id,
        content,
        sender: isOperator ? 'operator' : 'customer',
        senderType: isOperator ? 'OPERATOR' : 'CUSTOMER',
        senderId,
        messageType: messageType || 'TEXT',
        channel: conversation.goftinoChatId ? 'goftino' : 'internal',
      },
    });

    // If operator sends a message, pause/handoff AI and update human status
    const updateData: any = {
      lastMessage: content,
      lastMessageAt: new Date(),
    };

    if (isOperator) {
      updateData.aiStatus = 'PAUSED';
      updateData.humanStatus = 'IN_PROGRESS';
      if (
        conversation.status === 'NEW' ||
        conversation.status === 'AI_CONVERSATION'
      ) {
        updateData.status = 'WAITING_FOR_EXPERT';
      }

      await createTimelineEvent({
        customerId: conversation.customerId,
        conversationId: conversation.id,
        type: 'OPERATOR_MESSAGE_SENT',
        title: 'پیام اپراتور ارسال شد',
        description: content,
        actor: 'OPERATOR',
      });
    } else {
      updateData.unreadCount = { increment: 1 };
      await createTimelineEvent({
        customerId: conversation.customerId,
        conversationId: conversation.id,
        type: 'CUSTOMER_REPLIED',
        title: 'پاسخ مشتری ثبت شد',
        description: content,
        actor: 'CUSTOMER',
      });
    }

    await prisma.conversation.update({
      where: { id },
      data: updateData,
    });

    return res.status(201).json({
      success: true,
      message: newMessage,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function assignConversation(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { operatorId, operatorName } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        assignedUserId: operatorId || null,
        assignedOperator: operatorName || 'اپراتور',
        aiStatus: 'HANDED_OFF',
        humanStatus: 'ASSIGNED',
        status: 'WAITING_FOR_EXPERT',
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });

    await createTimelineEvent({
      customerId: conversation.customerId,
      conversationId: conversation.id,
      type: 'OPERATOR_JOINED',
      title: 'اپراتور به گفتگو ملحق شد',
      description: `اپراتور ${operatorName || 'کارشناس'} به گفتگو اضافه گردید.`,
      actor: 'OPERATOR',
    });

    return res.json({
      success: true,
      message: 'گفتگو به اپراتور ارجاع داده شد',
      conversation,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateConversationStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, aiStatus, humanStatus } = req.body;

    if (status && !VALID_CONVERSATION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `وضعیت نامعتبر است. مقادیر مجاز: ${VALID_CONVERSATION_STATUSES.join(', ')}`,
      });
    }

    const currentConv = await prisma.conversation.findUnique({ where: { id } });
    if (!currentConv) {
      return res.status(404).json({ success: false, error: 'گفتگو یافت نشد' });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(aiStatus && { aiStatus }),
        ...(humanStatus && { humanStatus }),
      },
    });

    // Record Timeline Events for major status transitions
    if (status === 'CLOSED') {
      await createTimelineEvent({
        customerId: updated.customerId,
        conversationId: updated.id,
        type: 'CONVERSATION_CLOSED',
        title: 'گفتگو بسته شد',
        actor: 'OPERATOR',
      });
    } else if (status === 'POLICY_ISSUED') {
      await createTimelineEvent({
        customerId: updated.customerId,
        conversationId: updated.id,
        type: 'POLICY_ISSUED',
        title: 'بیمه‌نامه نهایی صادر شد',
        actor: 'OPERATOR',
      });
    }

    return res.json({
      success: true,
      message: `وضعیت گفتگو به‌روزرسانی شد`,
      conversation: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function addConversationNote(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { content, author } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'متن یادداشت الزامی است.' });
    }

    const note = await prisma.conversationNote.create({
      data: {
        conversationId: id,
        author: author || 'اپراتور',
        content,
      },
    });

    return res.status(201).json({ success: true, note });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
