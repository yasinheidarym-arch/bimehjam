import { Request, Response } from 'express';
import {
  getAiMode,
  setAiMode,
  getAllSystemSettings,
  updateSystemSetting,
  AiMode,
  getAiConfig,
  saveAiConfig,
  testAiConnectionService,
} from '../services/settingService';

// GET /api/ai/mode
export async function getAiModeController(req: Request, res: Response) {
  try {
    const mode = await getAiMode();
    return res.json({
      success: true,
      data: {
        mode,
        label: mode === 'ACTIVE' ? 'فعال' : mode === 'TEST_MODE' ? 'تست مود' : 'خاموش',
        description:
          mode === 'ACTIVE'
            ? 'هوش مصنوعی پاسخ تولید می‌کند و مستقیماً به گفتینو ارسال می‌شود.'
            : mode === 'TEST_MODE'
            ? 'هوش مصنوعی روی پیام‌های واقعی مشتری پاسخ تولید می‌کند، در دیتابیس و پنل ذخیره می‌شود ولی به گفتینو یا مشتری ارسال نمی‌گردد.'
            : 'پایپ‌لاین هوش مصنوعی کاملاً متوقف است.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/ai/mode
export async function setAiModeController(req: Request, res: Response) {
  try {
    const { mode } = req.body;
    if (!mode || !['OFF', 'TEST_MODE', 'ACTIVE'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'وضعیت نامعتبر است. گزینه‌های مجاز: OFF (خاموش), TEST_MODE (تست مود), ACTIVE (فعال)',
      });
    }

    const updatedMode = await setAiMode(mode as AiMode);
    return res.json({
      success: true,
      data: {
        mode: updatedMode,
        label: updatedMode === 'ACTIVE' ? 'فعال' : updatedMode === 'TEST_MODE' ? 'تست مود' : 'خاموش',
      },
      message: `وضعیت هوش مصنوعی با موفقیت به "${updatedMode === 'ACTIVE' ? 'فعال' : updatedMode === 'TEST_MODE' ? 'تست مود' : 'خاموش'}" تغییر یافت.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/settings/ai-config or GET /api/ai/config
export async function getAiConfigController(req: Request, res: Response) {
  try {
    const config = await getAiConfig();
    return res.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// POST or PUT /api/settings/ai-config or /api/ai/config
export async function updateAiConfigController(req: Request, res: Response) {
  try {
    const body = req.body || {};
    const updated = await saveAiConfig(body);
    return res.json({
      success: true,
      data: updated,
      message: 'تنظیمات مدل هوش مصنوعی با موفقیت ذخیره شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/settings/ai-test or /api/ai/test-connection
export async function testAiConnectionController(req: Request, res: Response) {
  try {
    const result = await testAiConnectionService(req.body);
    return res.json({
      success: true,
      data: result,
      message: `تست اتصال با مدل ${result.modelUsed} در مدت زمان ${result.latencyMs} میلی‌ثانیه با موفقیت انجام شد.`,
    });
  } catch (error: any) {
    console.error('Error during AI connection test:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'خطا در برقراری ارتباط با سرویس هوش مصنوعی',
    });
  }
}

// GET /api/settings
export async function getSettingsController(req: Request, res: Response) {
  try {
    const settings = await getAllSystemSettings();
    return res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// POST /api/settings
export async function updateSettingController(req: Request, res: Response) {
  try {
    const { key, value, description } = req.body;
    if (!key || typeof value === 'undefined') {
      return res.status(400).json({ success: false, error: 'key و value الزامی هستند.' });
    }

    const updated = await updateSystemSetting(key, String(value), description);
    return res.json({
      success: true,
      data: updated,
      message: 'تنظیمات با موفقیت ذخیره شد.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}



// GET /api/settings/ai-response-policies
export async function getAiResponsePoliciesController(
  req: Request,
  res: Response
) {
  try {
    const prisma = (await import('../db/client')).default;

    const policies = await prisma.goftinoAiResponsePolicy.findMany({
      include: {
        insuranceCategory: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
      orderBy: {
        goftinoTopicTitle: 'asc',
      },
    });

    return res.json({
      success: true,
      data: policies,
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// POST /api/settings/ai-response-policies
export async function createAiResponsePolicyController(req: Request, res: Response) {
  try {
    const prisma = (await import('../db/client')).default;
    const { goftinoTopicId, goftinoTopicTitle, insuranceCategoryId, mode, active, fallbackMessage } = req.body;

    if (!String(goftinoTopicId || '').trim() || !String(goftinoTopicTitle || '').trim() || !String(insuranceCategoryId || '').trim()) {
      return res.status(400).json({ success: false, error: 'شناسه و عنوان رشته گفتینو و دسته بیمه مقصد الزامی هستند.' });
    }
    if (!["AI_ALLOWED", "HUMAN_ONLY"].includes(mode || 'AI_ALLOWED')) {
      return res.status(400).json({ success: false, error: 'حالت پاسخ‌گویی معتبر نیست.' });
    }

    const category = await prisma.insuranceCategory.findFirst({
      where: { id: String(insuranceCategoryId), status: 'ACTIVE' },
      select: { id: true },
    });
    if (!category) return res.status(400).json({ success: false, error: 'دستهٔ بیمهٔ مقصد فعال و معتبر نیست.' });

    const policy = await prisma.goftinoAiResponsePolicy.create({
      data: {
        goftinoTopicId: String(goftinoTopicId).trim(),
        goftinoTopicTitle: String(goftinoTopicTitle).trim(),
        insuranceCategoryId: category.id,
        mode: mode || 'AI_ALLOWED',
        active: typeof active === 'boolean' ? active : true,
        fallbackMessage: typeof fallbackMessage === 'string' && fallbackMessage.trim() ? fallbackMessage.trim() : null,
      },
      include: { insuranceCategory: { select: { id: true, name: true, slug: true, status: true } } },
    });
    return res.status(201).json({ success: true, data: policy, message: 'قانون گفتینو ایجاد شد.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.code === 'P2002' ? 'این شناسهٔ پایدار گفتینو قبلاً ثبت شده است.' : error.message });
  }
}

// PUT /api/settings/ai-response-policies/:id
export async function updateAiResponsePolicyController(
  req: Request,
  res: Response
) {
  try {
    const prisma = (await import('../db/client')).default;

    const { id } = req.params;

    const {
      mode,
      goftinoTopicId,
      goftinoTopicTitle,
      insuranceCategoryId,
      fallbackMessage,
      active,
    } = req.body;


    if (mode !== undefined && !['AI_ALLOWED', 'HUMAN_ONLY'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'حالت پاسخ‌گویی معتبر نیست.' });
    }
    if (insuranceCategoryId !== undefined) {
      const category = await prisma.insuranceCategory.findFirst({
        where: { id: String(insuranceCategoryId), status: 'ACTIVE' },
        select: { id: true },
      });
      if (!category) return res.status(400).json({ success: false, error: 'دستهٔ بیمهٔ مقصد فعال و معتبر نیست.' });
    }

    const updated = await prisma.goftinoAiResponsePolicy.update({
      where: {
        id,
      },
      data: {
        ...(typeof goftinoTopicId === 'string' && goftinoTopicId.trim() ? { goftinoTopicId: goftinoTopicId.trim() } : {}),
        ...(typeof goftinoTopicTitle === 'string' && goftinoTopicTitle.trim() ? { goftinoTopicTitle: goftinoTopicTitle.trim() } : {}),
        ...(insuranceCategoryId !== undefined ? { insuranceCategoryId: String(insuranceCategoryId) } : {}),
        ...(mode !== undefined ? { mode } : {}),
        ...(typeof fallbackMessage !== 'undefined'
          ? { fallbackMessage }
          : {}),
        ...(typeof active !== 'undefined'
          ? { active }
          : {}),
      },
      include: { insuranceCategory: { select: { id: true, name: true, slug: true, status: true } } },
    });


    return res.json({
      success: true,
      data: updated,
      message: 'قانون پاسخگویی AI ذخیره شد.',
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// DELETE /api/settings/ai-response-policies/:id
export async function deleteAiResponsePolicyController(req: Request, res: Response) {
  try {
    const prisma = (await import('../db/client')).default;
    await prisma.goftinoAiResponsePolicy.delete({ where: { id: req.params.id } });
    return res.json({ success: true, message: 'قانون گفتینو حذف شد.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
