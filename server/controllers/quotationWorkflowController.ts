import { Request, Response } from 'express';
import {
  getAllQuotationWorkflows,
  getQuotationWorkflowById,
  createQuotationWorkflow,
  updateQuotationWorkflow,
  deleteQuotationWorkflow,
  getOrCreateQuotationSession,
  processSessionAnswers,
} from '../services/quotationWorkflowService';
import prisma from '../db/client';

export async function getWorkflows(req: Request, res: Response) {
  try {
    const workflows = await getAllQuotationWorkflows();
    return res.status(200).json({ success: true, count: workflows.length, data: workflows });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const wf = await getQuotationWorkflowById(id);
    if (!wf) {
      return res.status(404).json({ success: false, error: 'گردش‌کار استعلام یافت نشد' });
    }
    return res.status(200).json({ success: true, data: wf });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createWorkflow(req: Request, res: Response) {
  try {
    const { insuranceProductId, name, status, questions } = req.body;
    if (!insuranceProductId || !name) {
      return res.status(400).json({ success: false, error: 'شناسه محصول و نام گردش‌کار الزامی است' });
    }

    const workflow = await createQuotationWorkflow({
      insuranceProductId,
      name,
      status,
      questions,
    });

    return res.status(201).json({ success: true, data: workflow });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updated = await updateQuotationWorkflow(id, body);
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await deleteQuotationWorkflow(id);
    return res.status(200).json({ success: true, message: 'گردش‌کار حذف شد' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createSession(req: Request, res: Response) {
  try {
    const { conversationId, customerId, productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, error: 'شناسه محصول الزامی است' });
    }

    const session = await getOrCreateQuotationSession({
      conversationId,
      customerId,
      productId,
    });

    return res.status(201).json({ success: true, data: session });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getSession(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const session = await prisma.quotationSession.findUnique({
      where: { id },
      include: {
        product: true,
        workflow: {
          include: {
            questions: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
        answers: {
          include: { question: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'جلسه استعلام پیدا نشد' });
    }

    return res.status(200).json({ success: true, data: session });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function submitAnswers(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { answers, source } = req.body;

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, error: 'فرمت پاسخ‌ها معتبر نیست' });
    }

    const result = await processSessionAnswers(id, answers, source || 'customer');
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
