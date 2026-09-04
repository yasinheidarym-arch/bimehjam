import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

const dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db');
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${dbPath}`;
}

import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { initialKnowledgeBase } from './src/data/knowledgeBase';
import { processGoftinoMessageWithAI } from './server/aiService';
import { processGoftinoWebhook } from './server/services/goftinoService';
import { handleGoftinoWebhook } from './server/controllers/webhookController';
import { createGoftinoV1Router } from './server/goftinoApi';
import apiV1Router from './server/routes/index';
import { errorHandler } from './server/middleware/errorHandler';
import { ensureDbReady } from './server/db/client';
import { ensureSystemAiBehaviorRules } from './server/services/aiBehaviorService';
import {
  GoftinoWebhookPayload,
  GoftinoLogEntry,
  KnowledgeBaseData,
  QuoteCalculationRequest,
  QuoteCalculationResult
} from './src/types';

// In-memory fallback data store for simulation
let knowledgeBaseStore: KnowledgeBaseData = { ...initialKnowledgeBase };
let goftinoLogsStore: GoftinoLogEntry[] = [
  {
    id: 'log_seed_1',
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    client: {
      id: 'c_98231',
      name: 'علی رضایی',
      phone: '09123456789',
      city: 'تهران',
      page: 'https://bimehjam.ir/car-insurance'
    },
    incomingMessage: 'سلام وقت بخیر، قیمت بیمه شخص ثالث پراید مدل ۱۴۰۰ با ۳ سال تخفیف عدم خسارت چقدر میشه؟ اقساطی هم داری؟',
    aiResponse: 'سلام علی عزیز، وقت شما هم بخیر. من مشاور بیمه جم هستم. قیمت بیمه شخص ثالث پراید ۱۴۰۰ با ۳ سال تخفیف حدود ۵,۱۰۰,۰۰۰ تومان می‌شود. خبر خوب اینکه در بیمه جم می‌توانید بدون چک و ضامن در ۴ قسط خریداری کنید! آیا تمایل دارید لینک صدور فوری را براتون ارسال کنم؟',
    analysis: {
      sentiment: 'مثبت (علاقمند)',
      leadScore: 88,
      customerIntent: 'تصمیم خرید قطعی (High Buying Intent)',
      extractedNeeds: {
        insuranceType: 'بیمه شخص ثالث خودرو',
        vehicleOrPropertyDetails: 'پراید مدل ۱۴۰۰ (۳ سال تخفیف عدم خسارت)',
        budgetOrDiscountMentioned: 'درخواست خرید اقساطی بدون چک',
        urgencyLevel: 'بالا'
      },
      recommendedAction: 'ارسال فوری لینک پرداخت قسطی و اخذ عکس کارت ماشین',
      keyInsights: [
        'مشتری قصد خرید اقساطی دارد',
        'پراید ۱۴۰۰ با ۳ سال تخفیف دارد',
        'سطح آمادگی خرید بالای ۸۵٪ است'
      ]
    },
    responseTimeMs: 620,
    status: 'پاسخ داده شد توسط AI'
  }
];

async function startServer() {
  // Ensure SQLite database is healthy and WAL mode is active
  await ensureDbReady();
  await ensureSystemAiBehaviorRules();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 1. Mount Modular REST API (Node.js + Express + Prisma SQLite)
  app.use('/api/v1', apiV1Router);
  app.use('/api', apiV1Router);


  // 2. Mount Goftino REST API (v1)
  app.use('/api/goftino/v1', createGoftinoV1Router());

  // 3. Goftino Webhook Endpoints (both /api/webhook/goftino and /api/goftino/webhook)
  app.get('/api/webhook/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/goftino/webhook', handleGoftinoWebhook);
  app.post('/api/webhook/goftino', handleGoftinoWebhook);

  // 4. Goftino Logs Management Endpoints
  app.get('/api/goftino/logs', (_req, res) => {
    res.json({
      success: true,
      logs: goftinoLogsStore,
      totalCount: goftinoLogsStore.length
    });
  });

  app.delete('/api/goftino/logs', (_req, res) => {
    goftinoLogsStore = [];
    res.json({ success: true, message: 'تاریخچه چت‌های گفتینو با موفقیت بازنشانی شد' });
  });

  // 5. Goftino Simulator Endpoint
  app.post('/api/goftino/simulate', async (req, res) => {
    const { messageText, clientName, clientPhone, clientCity, clientPage } = req.body;

    const mockPayload: GoftinoWebhookPayload = {
      event: 'new_message',
      data: {
        message_id: 'sim_msg_' + Date.now(),
        chat_id: 'chat_sim_' + (clientPhone || '09120000000'),
        user_id: 'user_sim_' + (clientPhone || '09120000000'),
        content: messageText || 'قیمت بیمه بدنه خودرو دنا پلاس چقدر میشه؟',
        type: 'text',
        sender: {
          id: 'sim_sender_' + Date.now(),
          from: 'user',
          name: clientName || 'خریدار آزمایشی'
        },
        client: {
          id: 'sim_client_' + (clientPhone || '09120000000'),
          name: clientName || 'خریدار آزمایشی',
          phone: clientPhone || '۰۹۱۲۰۰۰۰۰۰۰',
          city: clientCity || 'تهران',
          page: clientPage || 'https://bimehjam.ir/calculator'
        }
      }
    };

    // Store in DB via Service Layer
    await processGoftinoWebhook(mockPayload);

    const startTime = Date.now();
    const aiResult = await processGoftinoMessageWithAI(
      mockPayload.data.message?.text || messageText,
      mockPayload.data.client,
      knowledgeBaseStore
    );
    const responseTimeMs = Date.now() - startTime;

    const newLog: GoftinoLogEntry = {
      id: 'sim_log_' + Date.now(),
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      client: mockPayload.data.client,
      incomingMessage: messageText,
      aiResponse: aiResult.replyText,
      analysis: aiResult.analysis,
      responseTimeMs,
      status: 'پاسخ داده شد توسط AI'
    };

    goftinoLogsStore.unshift(newLog);

    res.json({
      success: true,
      result: newLog
    });
  });

  // 6. Knowledge Base Endpoints
  app.get('/api/knowledge-base', (_req, res) => {
    res.json({ success: true, knowledgeBase: knowledgeBaseStore });
  });

  app.post('/api/knowledge-base', (req, res) => {
    const updated = req.body as Partial<KnowledgeBaseData>;
    knowledgeBaseStore = {
      ...knowledgeBaseStore,
      ...updated
    };
    res.json({ success: true, knowledgeBase: knowledgeBaseStore, message: 'پایگاه دانش بیمه جم به‌روزرسانی شد' });
  });

  // 7. Online Insurance Quote Calculation Endpoint
  app.post('/api/calculate-quote', (req, res) => {
    const body = req.body as QuoteCalculationRequest;
    const { insuranceType, vehicleType, buildYear, noClaimYears, desiredFinancialCoverageMillion, familyMembersCount } = body;

    let baseToman = 0;
    let discountPct = 0;
    const breakdown: Array<{ label: string; amountToman: string }> = [];
    let aiAdvisorTip = '';

    const currentYearJalali = 1403;

    if (insuranceType === 'third_party') {
      let carBase = 6200000;
      if (vehicleType === 'pride' || vehicleType === 'motorcycle') carBase = 5200000;
      if (vehicleType === 'suv' || vehicleType === 'truck') carBase = 7800000;

      const yearsPassed = Math.max(0, currentYearJalali - (buildYear || 1400));
      let ageSurcharge = 0;
      if (yearsPassed > 15) ageSurcharge = 0.15;

      const claimDiscount = Math.min(0.70, (noClaimYears || 0) * 0.05);
      discountPct = Math.round(claimDiscount * 100);

      const coverageExtra = Math.max(0, ((desiredFinancialCoverageMillion || 60) - 60) / 10) * 120000;

      baseToman = Math.round(carBase * (1 + ageSurcharge) + coverageExtra);
      const discountAmount = Math.round(baseToman * claimDiscount);
      const finalPrice = baseToman - discountAmount;

      breakdown.push({ label: 'حق بیمه پایه دیه و حوادث راننده', amountToman: carBase.toLocaleString('fa-IR') + ' تومان' });
      if (coverageExtra > 0) {
        breakdown.push({ label: 'مازاد پوشش مالی درخواستی', amountToman: coverageExtra.toLocaleString('fa-IR') + ' تومان' });
      }
      breakdown.push({ label: `تخفیف عدم خسارت (${discountPct}٪)`, amountToman: '-' + discountAmount.toLocaleString('fa-IR') + ' تومان' });

      aiAdvisorTip = discountPct > 50
        ? 'تخفیف عدم خسارت شما فوق‌العاده است! پیشنهاد می‌شود برای حفظ سرمایه، بیمه بدنه با تخفیف ۵۰٪ خریدار صفر کیلومتر نیز اضافه فرمایید.'
        : 'می‌توانید همین بیمه‌نامه را بدون نیاز به چک در ۴ قسط مساوی از بیمه جم تهیه کنید.';

      const result: QuoteCalculationResult = {
        insuranceType,
        estimatedPriceRials: finalPrice * 10,
        estimatedPriceTomanFormatted: baseToman.toLocaleString('fa-IR') + ' تومان',
        discountAppliedPercentage: discountPct,
        finalPriceTomanFormatted: finalPrice.toLocaleString('fa-IR') + ' تومان',
        breakdown,
        aiAdvisorTip
      };
      res.json({ success: true, result });
      return;
    }

    baseToman = 4500000;
    discountPct = 20;
    const finalPrice = Math.round(baseToman * 0.8);

    breakdown.push({ label: 'حق بیمه محاسبه شده', amountToman: baseToman.toLocaleString('fa-IR') + ' تومان' });
    breakdown.push({ label: 'تخفیف ویژه جشنواره (۲۰٪)', amountToman: '-' + Math.round(baseToman * 0.2).toLocaleString('fa-IR') + ' تومان' });

    res.json({
      success: true,
      result: {
        insuranceType,
        estimatedPriceRials: finalPrice * 10,
        estimatedPriceTomanFormatted: baseToman.toLocaleString('fa-IR') + ' تومان',
        discountAppliedPercentage: discountPct,
        finalPriceTomanFormatted: finalPrice.toLocaleString('fa-IR') + ' تومان',
        breakdown,
        aiAdvisorTip: 'برای دریافت کدتخفیف ویژه با کارشناسان بیمه جم در ارتباط باشید.'
      }
    });
  });

  // Central Error Handler Middleware
  app.use(errorHandler);

  // Vite middleware setup for Development & Production build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bimeh Jam Express Backend Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
