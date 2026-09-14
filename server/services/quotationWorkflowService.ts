import prisma from '../db/client';
import { applicableQuotationQuestions } from './quotationStateMachine';

/**
 * Seed default Quotation Workflows for all Insurance Products
 */
export async function seedDefaultQuotationWorkflows() {
  const products = await prisma.insuranceProduct.findMany({
    include: {
      quotationQuestions: true,
      quotationWorkflows: true,
    },
  });

  for (const product of products) {
    let workflow = product.quotationWorkflows[0];

    if (!workflow) {
      workflow = await prisma.quotationWorkflow.create({
        data: {
          insuranceProductId: product.id,
          name: `گردش‌کار استعلام قیمت ${product.name}`,
          status: 'ACTIVE',
        },
      });
    }

    // Connect loose questions to workflow if not connected
    if (product.quotationQuestions && product.quotationQuestions.length > 0) {
      for (const q of product.quotationQuestions) {
        if (!q.workflowId) {
          await prisma.quotationQuestion.update({
            where: { id: q.id },
            data: { workflowId: workflow.id },
          });
        }
      }
    }
  }
}

/**
 * Get all quotation workflows with statistics
 */
export async function getAllQuotationWorkflows() {
  await seedDefaultQuotationWorkflows();

  const workflows = await prisma.quotationWorkflow.findMany({
    include: {
      insuranceProduct: {
        select: { id: true, name: true, category: true, status: true },
      },
      questions: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      },
      sessions: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return workflows.map((wf) => {
    const totalSessions = wf.sessions.length;
    const completedSessions = wf.sessions.filter((s) => s.status === 'COMPLETED');
    const completionRate = totalSessions > 0 ? Math.round((completedSessions.length / totalSessions) * 100) : 0;

    // Calculate Average Completion Time in minutes
    let totalTimeMs = 0;
    let completedTimeCount = 0;
    completedSessions.forEach((s) => {
      if (s.completedAt && s.createdAt) {
        const diff = new Date(s.completedAt).getTime() - new Date(s.createdAt).getTime();
        if (diff > 0) {
          totalTimeMs += diff;
          completedTimeCount++;
        }
      }
    });

    const avgTimeMinutes = completedTimeCount > 0 ? Math.round((totalTimeMs / completedTimeCount / 60000) * 10) / 10 : 0;

    return {
      id: wf.id,
      insuranceProductId: wf.insuranceProductId,
      productName: wf.insuranceProduct?.name || 'نامشخص',
      category: wf.insuranceProduct?.category || 'عمومی',
      name: wf.name,
      status: wf.status,
      questionCount: wf.questions.length,
      questions: wf.questions,
      totalSessions,
      completedSessionsCount: completedSessions.length,
      completionRate,
      avgCompletionTimeMinutes: avgTimeMinutes,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
    };
  });
}

/**
 * Get single workflow with details
 */
export async function getQuotationWorkflowById(id: string) {
  const wf = await prisma.quotationWorkflow.findUnique({
    where: { id },
    include: {
      insuranceProduct: {
        select: { id: true, name: true, category: true, status: true, description: true },
      },
      questions: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      },
      sessions: {
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          answers: {
            include: { question: true },
          },
        },
      },
    },
  });

  if (!wf) return null;

  const totalSessions = wf.sessions.length;
  const completedSessions = wf.sessions.filter((s) => s.status === 'COMPLETED');
  const completionRate = totalSessions > 0 ? Math.round((completedSessions.length / totalSessions) * 100) : 0;

  return {
    ...wf,
    totalSessions,
    completedSessionsCount: completedSessions.length,
    completionRate,
  };
}

/**
 * Create a new quotation workflow
 */
export async function createQuotationWorkflow(data: {
  insuranceProductId: string;
  name: string;
  status?: string;
  questions?: Array<{
    title: string;
    fieldName: string;
    type?: string;
    required?: boolean;
    order?: number;
    options?: string;
    validationRule?: string;
    condition?: string;
  }>;
}) {
  const workflow = await prisma.quotationWorkflow.create({
    data: {
      insuranceProductId: data.insuranceProductId,
      name: data.name,
      status: data.status || 'ACTIVE',
    },
  });

  if (data.questions && data.questions.length > 0) {
    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      await prisma.quotationQuestion.create({
        data: {
          workflowId: workflow.id,
          productId: data.insuranceProductId,
          title: q.title,
          fieldName: q.fieldName,
          type: q.type || 'text',
          required: q.required !== undefined ? q.required : true,
          order: i + 1,
          options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []),
          validationRule: q.validationRule || null,
          condition: typeof q.condition === 'string' ? q.condition : JSON.stringify(q.condition || {}),
        },
      });
    }
  }

  return getQuotationWorkflowById(workflow.id);
}

/**
 * Update workflow and its questions
 */
export async function updateQuotationWorkflow(
  id: string,
  data: {
    name?: string;
    status?: string;
    questions?: Array<{
      id?: string;
      title: string;
      fieldName: string;
      type?: string;
      required?: boolean;
      order?: number;
      options?: any;
      validationRule?: string;
      condition?: any;
    }>;
  }
) {
  const wf = await prisma.quotationWorkflow.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.status && { status: data.status }),
    },
  });

  if (data.questions) {
    // Delete old questions or sync
    await prisma.quotationQuestion.deleteMany({
      where: { workflowId: id },
    });

    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      await prisma.quotationQuestion.create({
        data: {
          workflowId: id,
          productId: wf.insuranceProductId,
          title: q.title,
          fieldName: q.fieldName,
          type: q.type || 'text',
          required: q.required !== undefined ? q.required : true,
          order: i + 1,
          options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []),
          validationRule: q.validationRule || null,
          condition: typeof q.condition === 'string' ? q.condition : JSON.stringify(q.condition || {}),
        },
      });
    }
  }

  return getQuotationWorkflowById(id);
}

/**
 * Delete workflow
 */
export async function deleteQuotationWorkflow(id: string) {
  return prisma.quotationWorkflow.delete({ where: { id } });
}

async function ensureProductQuotationWorkflow(productId: string) {
  let workflow = await prisma.quotationWorkflow.findFirst({
    where: { insuranceProductId: productId, status: 'ACTIVE' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  if (!workflow) {
    const product = await prisma.insuranceProduct.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    if (!product) throw new Error('Quotation product not found');

    workflow = await prisma.quotationWorkflow.create({
      data: {
        insuranceProductId: productId,
        name: `گردش‌کار استعلام قیمت ${product.name}`,
        status: 'ACTIVE',
      },
    });
  }

  // Questions managed in the product panel are authoritative for the product.
  // Link all of them to the selected active workflow, preserving their order.
  await prisma.quotationQuestion.updateMany({
    where: { productId },
    data: { workflowId: workflow.id },
  });

  return prisma.quotationWorkflow.findUnique({
    where: { id: workflow.id },
    include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
  });
}

/**
 * Get or create Quotation Session for conversation & product
 */
export async function getOrCreateQuotationSession(params: {
  conversationId?: string;
  customerId?: string;
  productId: string;
  sessionId?: string;
}) {
  const workflow = await ensureProductQuotationWorkflow(params.productId);

  // Check existing session
  let session = null;
  if (params.conversationId) {
    session = await prisma.quotationSession.findFirst({
      where: {
        conversationId: params.conversationId,
        productId: params.productId,
        ...(params.sessionId ? { id: params.sessionId } : { status: 'IN_PROGRESS' }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        answers: { include: { question: true } },
        workflow: { include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } } },
      },
    });
    // A workflow can be replaced or reactivated while a conversation is in
    // progress. Always rebind the session to the product's current canonical
    // workflow before deriving current/remaining questions.
    if (session && workflow && session.workflowId !== workflow.id) {
      session = await prisma.quotationSession.update({
        where: { id: session.id },
        data: { workflowId: workflow.id },
        include: {
          answers: { include: { question: true } },
          workflow: { include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } } },
        },
      });
    }
  }

  if (!session) {
    session = await prisma.quotationSession.create({
      data: {
        conversationId: params.conversationId || null,
        customerId: params.customerId || null,
        productId: params.productId,
        workflowId: workflow ? workflow.id : null,
        status: 'IN_PROGRESS',
        currentStep: 1,
        collectedData: '{}',
      },
      include: {
        answers: { include: { question: true } },
        workflow: { include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } } },
      },
    });
  }

  return session;
}

/** Read-only identity of the real, resumable quotation turn.
 * A selected product on Conversation is intentionally not enough. */
export async function getActiveQuotationTurnBinding(conversationId: string, productId?: string | null) {
  const session = await prisma.quotationSession.findFirst({
    where: {
      conversationId,
      status: 'IN_PROGRESS',
      ...(productId ? { productId } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    include: {
      workflow: { include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } } },
    },
  });
  if (!session) return null;
  let answers: Record<string, string> = {};
  try { answers = JSON.parse(session.collectedData || '{}'); } catch { answers = {}; }
  const currentQuestion = applicableQuotationQuestions(session.workflow?.questions || [], answers)
    .find(question => question.required && !answers[question.fieldName]) || null;
  return {
    sessionId: session.id,
    productId: session.productId,
    questionId: currentQuestion?.id || null,
    fieldName: currentQuestion?.fieldName || null,
  };
}

/**
 * Smartly extract structured quotation answers from customer message using Gemini
 */
export async function extractQuotationAnswersWithGemini(
  customerMessage: string,
  questions: Array<{ fieldName: string; title: string; type: string; options?: string | null }>
): Promise<Record<string, string>> {
  void customerMessage;
  void questions;
  // Retained as a compatibility export for external callers. The legacy
  // independent-model path is disabled; active quotation interpretation is
  // exclusively handled by aiBehaviorRuntime + the backend validator.
  return {};
}

/**
 * Save extracted/provided answers to QuotationSession, evaluate condition logic, and progress session.
 */
export async function processSessionAnswers(
  sessionId: string,
  newAnswers: Record<string, string>,
  source: 'customer' | 'ai_extracted' | 'operator' = 'customer',
  options: { questionLimit?: number } = {},
) {
  return prisma.$transaction(async (tx) => {
  const session = await tx.quotationSession.findUnique({
    where: { id: sessionId },
    include: {
      answers: true,
      product: true,
      workflow: {
        include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
      },
    },
  });

  if (!session) throw new Error('Quotation session not found');

  // Existing answers dictionary
  let currentData: Record<string, string> = {};
  try {
    currentData = JSON.parse(session.collectedData || '{}');
  } catch {
    currentData = {};
  }

  // Merge new answers
  const allowedAnswers = Object.fromEntries(Object.entries(newAnswers).filter(([key, value]) =>
    value !== undefined && value !== null && value !== '' && session.workflow?.questions.some(q => q.fieldName === key),
  ));
  const updatedData = { ...currentData, ...allowedAnswers };

  // Save each answer in QuotationAnswer table
  for (const [key, val] of Object.entries(allowedAnswers)) {
    if (val === undefined || val === null || val === '') continue;

    const matchedQuestion = session.workflow?.questions.find((q) => q.fieldName === key);

    const existingAns = session.answers.find((a) => a.fieldName === key);
    if (existingAns) {
      await tx.quotationAnswer.update({
        where: { id: existingAns.id },
        data: {
          value: String(val),
          source,
        },
      });
    } else {
      await tx.quotationAnswer.create({
        data: {
          sessionId,
          questionId: matchedQuestion ? matchedQuestion.id : null,
          fieldName: key,
          value: String(val),
          source,
        },
      });
    }
  }

  // Evaluate remaining questions based on conditions
  // Do not depend on relation materialization order. The lowest configured
  // order is always authoritative for both answer capture and the next turn.
  const allQuestions = [...(session.workflow?.questions || [])].sort(
    (a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const applicableQuestions = applicableQuotationQuestions(allQuestions, updatedData);
  const activeQuestions = options.questionLimit && options.questionLimit > 0
    ? applicableQuestions.slice(0, options.questionLimit)
    : applicableQuestions;

  // Determine missing questions
  const missingQuestions = activeQuestions.filter(
    (q) => q.required && (updatedData[q.fieldName] === undefined || updatedData[q.fieldName] === '')
  );

  const isCompleted = missingQuestions.length === 0 && activeQuestions.length > 0;
  const nextQuestion = missingQuestions[0] || null;

  // Update session state
  const updatedSession = await tx.quotationSession.update({
    where: { id: sessionId },
    data: {
      collectedData: JSON.stringify(updatedData),
      status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      completedAt: isCompleted ? new Date() : null,
      currentStep: activeQuestions.length - missingQuestions.length + 1,
    },
    include: {
      product: true,
      answers: { include: { question: true } },
    },
  });

  // Completion means only that the questionnaire is complete. Registration
  // and operator referral happen later, after profile completion and explicit
  // customer confirmation in the AI pipeline.
  const leadId = null;

  return {
    sessionId: session.id,
    isCompleted,
    nextQuestion,
    remainingQuestions: missingQuestions,
    collectedData: updatedData,
    completedAnswersCount: activeQuestions.length - missingQuestions.length,
    totalQuestionsCount: activeQuestions.length,
    leadId,
    session: updatedSession,
  };
  });
}

/**
 * Generate specific System Prompt context for AI conversation using session state
 */
export async function generateQuotationEnginePromptContext(params: {
  conversationId?: string;
  customerUrl?: string;
  customerMessage: string;
}): Promise<string> {
  void params;
  // The callerless legacy prompt path is intentionally inert. Production uses
  // the shared runtime/state-machine path and must not assemble a second prompt.
  return '';
}
