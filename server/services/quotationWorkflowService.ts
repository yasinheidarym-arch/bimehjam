import prisma from '../db/client';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

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
        orderBy: { order: 'asc' },
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
        orderBy: { order: 'asc' },
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
          order: q.order !== undefined ? q.order : i + 1,
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
          order: q.order !== undefined ? q.order : i + 1,
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
    orderBy: { createdAt: 'asc' },
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
    include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
  });
}

/**
 * Get or create Quotation Session for conversation & product
 */
export async function getOrCreateQuotationSession(params: {
  conversationId?: string;
  customerId?: string;
  productId: string;
}) {
  const workflow = await ensureProductQuotationWorkflow(params.productId);

  // Check existing session
  let session = null;
  if (params.conversationId) {
    session = await prisma.quotationSession.findFirst({
      where: {
        conversationId: params.conversationId,
        productId: params.productId,
        status: 'IN_PROGRESS',
      },
      include: {
        answers: { include: { question: true } },
        workflow: { include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } },
      },
    });
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
        workflow: { include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } },
      },
    });
  }

  return session;
}

/**
 * Smartly extract structured quotation answers from customer message using Gemini
 */
export async function extractQuotationAnswersWithGemini(
  customerMessage: string,
  questions: Array<{ fieldName: string; title: string; type: string; options?: string | null }>
): Promise<Record<string, string>> {
  if (!ai || !customerMessage.trim() || questions.length === 0) {
    return {};
  }

  try {
    const fieldsDescription = questions
      .map(
        (q) =>
          `- ${q.fieldName}: ${q.title} (نوع: ${q.type}${
            q.options && q.options !== '[]' ? `, گزینه‌ها: ${q.options}` : ''
          })`
      )
      .join('\n');

    const prompt = `شما یک ماژول استخراج داده‌های فرم بیمه هستید.
متن پیام مشتری: "${customerMessage}"

فیلدهای موردنظر جهت استخراج:
${fieldsDescription}

دستورالعمل:
متن مشتری را دقیقاً بررسی کنید. اگر کاربر به هر یک از فیلدهای فوق پاسخ داده یا مقداری برای آن ذکر کرده است (حتی اگر چند فیلد را همزمان در یک جمله گفته باشد، مانند "ساختمان ۵ طبقه، ۲۰ واحد، ۲ آسانسور")، مقادیر آن‌ها را استخراج کنید.
خروجی فقط و فقط باید یک آرایه JSON متناظر باشد و هیچ متن اضافه، markdown یا توضیح دیگری نداشته باشد.

فرمت خروجی مطلوب:
{
  "extracted": {
    "fieldName1": "مقدار1",
    "fieldName2": "مقدار2"
  }
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return parsed.extracted || {};
  } catch (error) {
    console.error('Error extracting quotation answers with Gemini:', error);
    return {};
  }
}

/**
 * Save extracted/provided answers to QuotationSession, evaluate condition logic, and progress session.
 */
export async function processSessionAnswers(
  sessionId: string,
  newAnswers: Record<string, string>,
  source: 'customer' | 'ai_extracted' | 'operator' = 'customer'
) {
  const session = await prisma.quotationSession.findUnique({
    where: { id: sessionId },
    include: {
      answers: true,
      product: true,
      workflow: {
        include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
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
  const updatedData = { ...currentData, ...newAnswers };

  // Save each answer in QuotationAnswer table
  for (const [key, val] of Object.entries(newAnswers)) {
    if (val === undefined || val === null || val === '') continue;

    const matchedQuestion = session.workflow?.questions.find((q) => q.fieldName === key);

    const existingAns = session.answers.find((a) => a.fieldName === key);
    if (existingAns) {
      await prisma.quotationAnswer.update({
        where: { id: existingAns.id },
        data: {
          value: String(val),
          source,
        },
      });
    } else {
      await prisma.quotationAnswer.create({
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
  const activeQuestions: typeof allQuestions = [];

  for (const q of allQuestions) {
    let isApplicable = true;

    // Check condition logic e.g. {"dependsOn": "has_trainer", "value": "true"}
    if (q.condition && q.condition !== '{}') {
      try {
        const condObj = JSON.parse(q.condition);
        if (condObj.dependsOn) {
          const parentVal = updatedData[condObj.dependsOn];
          if (String(parentVal) !== String(condObj.value)) {
            isApplicable = false;
          }
        }
      } catch {
        // ignore parse error
      }
    }

    if (isApplicable) {
      activeQuestions.push(q);
    }
  }

  // Determine missing questions
  const missingQuestions = activeQuestions.filter(
    (q) => q.required && (updatedData[q.fieldName] === undefined || updatedData[q.fieldName] === '')
  );

  const isCompleted = missingQuestions.length === 0 && activeQuestions.length > 0;
  const nextQuestion = missingQuestions[0] || null;

  // Update session state
  const updatedSession = await prisma.quotationSession.update({
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
}

/**
 * Generate specific System Prompt context for AI conversation using session state
 */
export async function generateQuotationEnginePromptContext(params: {
  conversationId?: string;
  customerUrl?: string;
  customerMessage: string;
}): Promise<string> {
  const { resolveProductByUrl } = await import('./productIntelligenceService');

  // 1. Identify product from URL or message
  let resolvedMap = null;
  if (params.customerUrl) {
    resolvedMap = await resolveProductByUrl(params.customerUrl);
  }

  if (!resolvedMap || !resolvedMap.product) return '';

  const product = resolvedMap.product;

  // 2. Get or create Quotation Session
  const session = await getOrCreateQuotationSession({
    conversationId: params.conversationId,
    productId: product.id,
  });

  // 3. Extract any answers from customer message
  const questions = session.workflow?.questions || [];
  if (questions.length > 0 && params.customerMessage) {
    const extracted = await extractQuotationAnswersWithGemini(params.customerMessage, questions);
    if (Object.keys(extracted).length > 0) {
      await processSessionAnswers(session.id, extracted, 'ai_extracted');
    }
  }

  // 4. Re-evaluate session state
  const evaluation = await processSessionAnswers(session.id, {}, 'customer');

  const collectedEntries = Object.entries(evaluation.collectedData);
  const collectedSummaryText =
    collectedEntries.length > 0
      ? collectedEntries.map(([k, v]) => `  • ${k}: ${v}`).join('\n')
      : '  (هنوز پاسخی ثبت نشده است)';

  if (evaluation.isCompleted) {
    return `
✅ تکمیل کامل فرآیند استعلام قیمت (${product.name}):
- تمام سوالات استعلام قیمت با موفقیت دریافت گردید:
${collectedSummaryText}

🛑 دستورالعمل پاسخ هوش مصنوعی:
۱. پرسش‌های بیمه‌ای کامل شده‌اند، اما ثبت درخواست هنوز انجام نشده است.
۲. هیچ قیمت قطعی، کد، زمان تضمینی یا ادعای ارجاع مطرح نکنید؛ جمع‌آوری اطلاعات تماس و تأیید نهایی در لایهٔ قطعی بعدی انجام می‌شود.
`;
  }

  const nextQ = evaluation.nextQuestion;
  if (!nextQ) return '';

  return `
📋 موتور جریان هوشمند استعلام قیمت (Dynamic Quotation Engine):
- محصول جاری: "${product.name}"
- پیشرفت استعلام: ${evaluation.completedAnswersCount} از ${evaluation.totalQuestionsCount} سوال دریافت شده است.

مشخصات دریافت شده تا این لحظه:
${collectedSummaryText}

🎯 سوال اختصاصی بعدی که باید **دقیقاً همین الان** از کاربر بپرسید:
👉 "${nextQ.title}" ${nextQ.options && nextQ.options !== '[]' ? `(گزینه‌ها: ${nextQ.options})` : ''}

🛑 قوانین صریح جریان سوالات:
۱. **قانون طلایی**: فقط و فقط یک سوال مطرح کنید (دقیقاً همان سوال فوق).
۲. هرگز سوالات قبلی دریافت شده را تکرار نکنید.
۳. اگر کاربر اطلاعات دیگری ارائه داد، آن را ثبت کرده و سپس به سوال فوق بازگردید.
۴. بعد از دریافت پاسخ این سوال، سیستم به‌صورت خودکار سوال بعدی را در پیام بعدی بارگذاری خواهد کرد.
`;
}
