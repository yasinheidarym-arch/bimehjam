import { Request, Response } from 'express';
import {
  setAiMode,
  getAllSystemSettings,
  updateSystemSetting,
  AiMode,
  getAiConfig,
  saveAiConfig,
  testAiConnectionService,
  getAiModeStatus,
  setAiSchedule,
} from '../services/settingService';
import { effectiveAiStatusLabel } from '../../shared/aiSchedule';
import { getGoftinoAiPolicyCatalog, setGoftinoAiPolicyEnabled } from '../services/goftinoAiPolicyService';

// GET /api/ai/mode
export async function getAiModeController(req: Request, res: Response) {
  try {
    const { mode, schedule, effectiveMode } = await getAiModeStatus();
    return res.json({
      success: true,
      data: {
        mode,
        schedule,
        effectiveMode,
        effectiveStatus: effectiveAiStatusLabel(effectiveMode),
        label: effectiveMode === 'ACTIVE' ? 'فعال' : effectiveMode === 'TEST_MODE' ? 'تست مود' : 'خاموش',
        description:
          effectiveMode === 'ACTIVE'
            ? 'هوش مصنوعی پاسخ تولید می‌کند و مستقیماً به گفتینو ارسال می‌شود.'
            : effectiveMode === 'TEST_MODE'
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
    const status = await getAiModeStatus();
    return res.json({
      success: true,
      data: {
        mode: updatedMode,
        schedule: status.schedule,
        effectiveMode: status.effectiveMode,
        effectiveStatus: effectiveAiStatusLabel(status.effectiveMode),
        label: status.effectiveMode === 'ACTIVE' ? 'فعال' : status.effectiveMode === 'TEST_MODE' ? 'تست مود' : 'خاموش',
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
    const policies = await getGoftinoAiPolicyCatalog();

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

export async function updateAiScheduleController(req: Request, res: Response) {
  try {
    const schedule = await setAiSchedule(req.body);
    const { effectiveMode } = await getAiModeStatus();
    return res.json({
      success: true,
      data: { schedule, effectiveMode, effectiveStatus: effectiveAiStatusLabel(effectiveMode) },
      message: 'زمان‌بندی پاسخگویی هوش مصنوعی ذخیره شد.',
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'ذخیره زمان‌بندی ناموفق بود.' });
  }
}

// PUT /api/settings/ai-response-policies/:id
export async function updateAiResponsePolicyController(
  req: Request,
  res: Response
) {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'وضعیت روشن/خاموش باید مشخص باشد.' });
    }

    const updated = await setGoftinoAiPolicyEnabled(id, enabled);


    return res.json({
      success: true,
      data: updated,
      message: 'وضعیت پاسخ‌گویی AI ذخیره شد.',
    });

  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}
