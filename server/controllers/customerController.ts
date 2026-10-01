import { Request, Response } from 'express';
import prisma from '../db/client';
import { createTimelineEvent } from '../services/timelineService';
import { resolveConversationInsuranceDisplays } from '../services/conversationInsuranceDisplay';

export async function getCustomers(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const city = (req.query.city as string) || '';
    const tag = (req.query.tag as string) || '';
    const assignedOperator = (req.query.assignedOperator as string) || '';

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
        { tags: { contains: search } },
      ];
    }

    if (city) {
      where.city = { contains: city };
    }

    if (tag) {
      where.tags = { contains: tag };
    }

    if (assignedOperator) {
      where.assignedOperator = { contains: assignedOperator };
    }

    const [total, rawCustomers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          conversations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, currentProductId: true, currentProductName: true, collectedData: true, lastMessage: true, lastMessageAt: true },
          },
          tasks: {
            where: { status: 'Pending' },
            orderBy: { dueDate: 'asc' },
            take: 3,
          },
          _count: {
            select: { conversations: true, tasks: true, customerNotes: true, timelineEvents: true },
          },
        },
      }),
    ]);

    const listInsuranceDisplays = await resolveConversationInsuranceDisplays(
      rawCustomers.flatMap((customer) => customer.conversations.map((conversation) => ({
        id: conversation.id,
        currentProductId: conversation.currentProductId,
        collectedData: conversation.collectedData,
        customerMetadata: customer.metadata,
      }))),
    );

    const customers = rawCustomers.map((c) => {
      let parsedInterestedTypes: string[] = [];
      let parsedIssuedPolicies: any[] = [];
      let parsedWebsiteActivity: any[] = [];
      try {
        if (c.interestedInsuranceTypes) parsedInterestedTypes = JSON.parse(c.interestedInsuranceTypes);
      } catch (e) {
        parsedInterestedTypes = [];
      }
      try {
        if (c.issuedPolicies) parsedIssuedPolicies = JSON.parse(c.issuedPolicies);
      } catch (e) {
        parsedIssuedPolicies = [];
      }
      try {
        if (c.websiteActivity) parsedWebsiteActivity = JSON.parse(c.websiteActivity);
      } catch (e) {
        parsedWebsiteActivity = [];
      }

      const firstVisit =
        parsedWebsiteActivity.length > 0
          ? (parsedWebsiteActivity[0].date || parsedWebsiteActivity[0].timestamp)
          : c.createdAt;

      const lastVisit =
        parsedWebsiteActivity.length > 0
          ? (parsedWebsiteActivity[parsedWebsiteActivity.length - 1].date || parsedWebsiteActivity[parsedWebsiteActivity.length - 1].timestamp)
          : c.lastActivity;

      return {
        ...c,
        conversations: c.conversations.map((conversation) => ({
          ...conversation,
          currentProductName: listInsuranceDisplays.get(conversation.id)?.name || 'بیمه عمومی',
          insuranceDisplay: listInsuranceDisplays.get(conversation.id),
        })),
        interestedInsuranceTypes: parsedInterestedTypes,
        issuedPolicies: parsedIssuedPolicies,
        websiteActivity: parsedWebsiteActivity,
        firstVisit,
        lastVisit,
      };
    });

    return res.json({
      success: true,
      data: customers,
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

export async function getCustomerById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const c = await prisma.customer.findUnique({
      where: { id },
      include: {
        conversations: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignedUser: {
              select: { id: true, name: true, avatar: true },
            },
            messages: {
              orderBy: { createdAt: 'asc' },
            },
            timelineEvents: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
        },
        timelineEvents: {
          orderBy: { createdAt: 'desc' },
        },
        customerNotes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!c) {
      return res.status(404).json({ success: false, error: 'مشتری یافت نشد' });
    }

    let parsedInterestedTypes: string[] = [];
    let parsedIssuedPolicies: any[] = [];
    let parsedWebsiteActivity: any[] = [];
    let parsedMetadata = {};
    try {
      if (c.interestedInsuranceTypes) parsedInterestedTypes = JSON.parse(c.interestedInsuranceTypes);
    } catch (e) {
      parsedInterestedTypes = [];
    }
    try {
      if (c.issuedPolicies) parsedIssuedPolicies = JSON.parse(c.issuedPolicies);
    } catch (e) {
      parsedIssuedPolicies = [];
    }
    try {
      if (c.websiteActivity) parsedWebsiteActivity = JSON.parse(c.websiteActivity);
    } catch (e) {
      parsedWebsiteActivity = [];
    }
    try {
      if (c.metadata) parsedMetadata = JSON.parse(c.metadata);
    } catch (e) {
      parsedMetadata = {};
    }

    const firstVisit =
      parsedWebsiteActivity.length > 0
        ? (parsedWebsiteActivity[0].date || parsedWebsiteActivity[0].timestamp)
        : c.createdAt;

    const lastVisit =
      parsedWebsiteActivity.length > 0
        ? (parsedWebsiteActivity[parsedWebsiteActivity.length - 1].date || parsedWebsiteActivity[parsedWebsiteActivity.length - 1].timestamp)
        : c.lastActivity;

    const detailInsuranceDisplays = await resolveConversationInsuranceDisplays(
      c.conversations.map((conversation) => ({
        id: conversation.id,
        currentProductId: conversation.currentProductId,
        collectedData: conversation.collectedData,
        customerMetadata: c.metadata,
      })),
    );

    const customer = {
      ...c,
      conversations: c.conversations.map((conversation) => ({
        ...conversation,
        currentProductName: detailInsuranceDisplays.get(conversation.id)?.name || 'بیمه عمومی',
        insuranceDisplay: detailInsuranceDisplays.get(conversation.id),
      })),
      interestedInsuranceTypes: parsedInterestedTypes,
      issuedPolicies: parsedIssuedPolicies,
      websiteActivity: parsedWebsiteActivity,
      metadata: parsedMetadata,
      firstVisit,
      lastVisit,
    };

    return res.json({
      success: true,
      customer,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createCustomer(req: Request, res: Response) {
  try {
    const { name, phone, email, city, tags, interestedInsuranceTypes, assignedOperator, internalNotesText, metadata, goftinoUserId } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'نام مشتری الزامی است.' });
    }

    const newCustomer = await prisma.customer.create({
      data: {
        name,
        phone,
        email,
        city: city || 'نامشخص',
        tags: Array.isArray(tags) ? tags.join(',') : tags || '',
        interestedInsuranceTypes: Array.isArray(interestedInsuranceTypes) ? JSON.stringify(interestedInsuranceTypes) : '[]',
        assignedOperator: assignedOperator || null,
        internalNotesText: internalNotesText || '',
        metadata: typeof metadata === 'object' ? JSON.stringify(metadata) : metadata || '{}',
        goftinoUserId,
      },
    });

    await createTimelineEvent({
      customerId: newCustomer.id,
      type: 'CONVERSATION_CREATED',
      title: 'پرونده مشتری ایجاد شد',
      description: `ثبت پرونده مشتری ${newCustomer.name}`,
      actor: 'OPERATOR',
    });

    return res.status(201).json({
      success: true,
      message: 'پرونده مشتری با موفقیت ایجاد شد',
      customer: newCustomer,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateCustomer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, phone, email, city, tags, leadScore, leadStatus, assignedOperator, interestedInsuranceTypes, internalNotesText, issuedPolicies, metadata } = req.body;

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'مشتری یافت نشد' });
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(city && { city }),
        ...(leadScore !== undefined && { leadScore: parseInt(leadScore) }),
        ...(leadStatus && { leadStatus }),
        ...(assignedOperator && { assignedOperator }),
        ...(internalNotesText !== undefined && { internalNotesText }),
        ...(tags !== undefined && { tags: Array.isArray(tags) ? tags.join(',') : tags }),
        ...(interestedInsuranceTypes !== undefined && { interestedInsuranceTypes: Array.isArray(interestedInsuranceTypes) ? JSON.stringify(interestedInsuranceTypes) : interestedInsuranceTypes }),
        ...(issuedPolicies !== undefined && { issuedPolicies: Array.isArray(issuedPolicies) ? JSON.stringify(issuedPolicies) : issuedPolicies }),
        ...(metadata !== undefined && { metadata: typeof metadata === 'object' ? JSON.stringify(metadata) : metadata }),
      },
    });

    return res.json({
      success: true,
      message: 'اطلاعات مشتری به‌روزرسانی شد',
      customer: updatedCustomer,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function addCustomerNote(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { content, author } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'متن یادداشت الزامی است.' });
    }

    const note = await prisma.customerNote.create({
      data: {
        customerId: id,
        author: author || 'کارشناس بیمه',
        content,
      },
    });

    return res.status(201).json({ success: true, note });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteCustomer(req: Request, res: Response) {
  try {
    const { id } = req.params;

    await prisma.customer.delete({ where: { id } });

    return res.json({
      success: true,
      message: 'پرونده مشتری با موفقیت حذف شد',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
