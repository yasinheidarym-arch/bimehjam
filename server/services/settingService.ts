import prisma from '../db/client';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { AiMode, AiSchedule, DEFAULT_AI_SCHEDULE, isLegacyAiSchedule, resolveEffectiveAiMode, validateAiSchedule } from '../../shared/aiSchedule';

export type { AiMode, AiSchedule } from '../../shared/aiSchedule';

export interface AiConfig {
  aiMode: AiMode;
  aiProvider: 'openai';
  openaiApiKey: string;
  openaiModel: string;
  temperature: number;
  maxTokens: number;
  systemPromptOverride: string;
}

const DEFAULT_OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const DEFAULT_OPENAI_MODEL = "gpt-5";

export async function getAiMode(): Promise<AiMode> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'ai_mode' },
    });
    if (setting && (setting.value === 'OFF' || setting.value === 'TEST_MODE' || setting.value === 'ACTIVE')) {
      return setting.value as AiMode;
    }
    return 'TEST_MODE'; // Default to AI Test Mode for safe testing
  } catch (err) {
    console.warn('Could not read ai_mode setting from DB, using TEST_MODE default:', err);
    return 'TEST_MODE';
  }
}

export async function setAiMode(mode: AiMode): Promise<string> {
  const validModes: AiMode[] = ['OFF', 'TEST_MODE', 'ACTIVE'];
  const sanitizedMode = validModes.includes(mode) ? mode : 'TEST_MODE';

  const updated = await prisma.systemSetting.upsert({
    where: { key: 'ai_mode' },
    create: {
      key: 'ai_mode',
      value: sanitizedMode,
      description: 'وضعیت اجرای هوش مصنوعی: خاموش (OFF)، تست مود (TEST_MODE)، فعال (ACTIVE)',
    },
    update: {
      value: sanitizedMode,
    },
  });
  return updated.value;
}

function defaultAiSchedule(): AiSchedule {
  return {
    ...DEFAULT_AI_SCHEDULE,
    weekly: Object.fromEntries(Object.entries(DEFAULT_AI_SCHEDULE.weekly).map(([day, value]) => [day, { ...value }])) as AiSchedule['weekly'],
  };
}

export async function getAiSchedule(): Promise<AiSchedule> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'ai_response_schedule' }, select: { value: true } });
    if (!setting?.value) return defaultAiSchedule();
    const parsed = JSON.parse(setting.value) as unknown;
    const schedule = validateAiSchedule(parsed);
    if (isLegacyAiSchedule(parsed)) {
      await prisma.systemSetting.update({ where: { key: 'ai_response_schedule' }, data: { value: JSON.stringify(schedule) } });
    }
    return schedule;
  } catch (error) {
    console.warn('Could not read AI response schedule, using disabled default:', error instanceof Error ? error.message : 'unknown error');
    return defaultAiSchedule();
  }
}

export async function setAiSchedule(input: unknown): Promise<AiSchedule> {
  const schedule = validateAiSchedule(input);
  await prisma.systemSetting.upsert({
    where: { key: 'ai_response_schedule' },
    create: { key: 'ai_response_schedule', value: JSON.stringify(schedule), description: 'زمان‌بندی پاسخگویی AI بر اساس ساعت ایران (Asia/Tehran)' },
    update: { value: JSON.stringify(schedule) },
  });
  return schedule;
}

export async function getEffectiveAiMode(now = new Date()): Promise<AiMode> {
  const [manualMode, schedule] = await Promise.all([getAiMode(), getAiSchedule()]);
  return resolveEffectiveAiMode(manualMode, schedule, now);
}

export async function getAiConfig(): Promise<AiConfig> {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'ai_mode',
            'ai_provider',
            'openai_api_key',
            'openai_model',
            'ai_temperature',
            'ai_max_tokens',
            'ai_system_prompt_override',
          ],
        },
      },
    });

    const map: Record<string, string> = {};
    settings.forEach((s) => {
      map[s.key] = s.value;
    });

    return {
      aiMode: (map['ai_mode'] as AiMode) || 'TEST_MODE',
      aiProvider: 'openai',
      openaiApiKey: map['openai_api_key'] || DEFAULT_OPENAI_KEY,
      openaiModel: map['openai_model'] || DEFAULT_OPENAI_MODEL,
      temperature: map['ai_temperature'] ? parseFloat(map['ai_temperature']) : 0.6,
      maxTokens: map['ai_max_tokens'] ? parseInt(map['ai_max_tokens'], 10) : 1500,
      systemPromptOverride: map['ai_system_prompt_override'] || '',
    };
  } catch (err) {
    return {
      aiMode: 'TEST_MODE',
      aiProvider: 'openai',
      openaiApiKey: DEFAULT_OPENAI_KEY,
      openaiModel: DEFAULT_OPENAI_MODEL,
      temperature: 0.6,
      maxTokens: 1500,
      systemPromptOverride: '',
    };
  }
}

export async function saveAiConfig(config: Partial<AiConfig>): Promise<AiConfig> {
  const operations: Promise<any>[] = [];

  if (config.aiMode) {
    operations.push(updateSystemSetting('ai_mode', config.aiMode, 'وضعیت اجرای هوش مصنوعی'));
  }
  operations.push(updateSystemSetting('ai_provider', 'openai', 'ارائه‌دهنده فعال هوش مصنوعی (OpenAI)'));
  
  if (typeof config.openaiApiKey === 'string') {
    operations.push(updateSystemSetting('openai_api_key', config.openaiApiKey, 'کلید API چت جی‌پی‌تی OpenAI'));
  }
  if (config.openaiModel) {
    operations.push(updateSystemSetting('openai_model', config.openaiModel, 'مدل OpenAI انتخابی (مانند gpt-5)'));
  }
  if (typeof config.temperature === 'number') {
    operations.push(updateSystemSetting('ai_temperature', String(config.temperature), 'دمای تولید متن AI'));
  }
  if (typeof config.maxTokens === 'number') {
    operations.push(updateSystemSetting('ai_max_tokens', String(config.maxTokens), 'حداکثر توکن خروجی AI'));
  }
  if (typeof config.systemPromptOverride === 'string') {
    operations.push(updateSystemSetting('ai_system_prompt_override', config.systemPromptOverride, 'پرامپت سیستمی سفارشی'));
  }

  await Promise.all(operations);
  return await getAiConfig();
}

export async function testAiConnectionService(params?: {
  provider?: string;
  apiKey?: string;
  model?: string;
}) {
  const config = await getAiConfig();
  const startTime = Date.now();

  const keyToUse = params?.apiKey || config.openaiApiKey || DEFAULT_OPENAI_KEY;
  const requestedModel = params?.model || config.openaiModel || DEFAULT_OPENAI_MODEL;

  if (!keyToUse) {
    throw new Error('کلید OPENAI_API_KEY تنظیم نشده است.');
  }

  const openai = new OpenAI({ apiKey: keyToUse });
  let modelUsed = requestedModel;
  let replyText = '';

  try {
    const response = await openai.chat.completions.create({
      model: requestedModel,
      messages: [
        { role: 'system', content: 'شما دستیار هوش مصنوعی سامانه بیمه جم هستید. در یک پاسخ بسیار کوتاه و محترمانه فارسی تایید اتصال را اعلام کنید.' },
        { role: 'user', content: 'تست اتصال به سرور OpenAI ChatGPT و مدل بیمه جم.' }
      ],
      max_tokens: 100,
      temperature: 0.5,
    });
    replyText = response.choices[0]?.message?.content || 'اتصال موفقیت‌آمیز بود.';
  } catch (err: any) {
    if (requestedModel === 'gpt-5') {
      console.warn('GPT-5 direct call note, falling back to gpt-4o for testing:', err?.message);
      modelUsed = 'gpt-4o';
      const fallback = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'شما دستیار هوش مصنوعی سامانه بیمه جم هستید. در یک پاسخ بسیار کوتاه و محترمانه فارسی تایید اتصال را اعلام کنید.' },
          { role: 'user', content: 'تست اتصال به سرور OpenAI ChatGPT و مدل بیمه جم.' }
        ],
        max_tokens: 100,
        temperature: 0.5,
      });
      replyText = fallback.choices[0]?.message?.content || 'اتصال موفقیت‌آمیز بود.';
    } else {
      throw err;
    }
  }

  const latencyMs = Date.now() - startTime;
  return {
    success: true,
    provider: 'OpenAI ChatGPT',
    requestedModel,
    modelUsed,
    latencyMs,
    replyText: replyText.trim(),
    timestamp: new Date().toISOString(),
  };
}

export async function getAllSystemSettings(): Promise<Record<string, string>> {
  try {
    const settings = await prisma.systemSetting.findMany();
    const map: Record<string, string> = {
      ai_mode: 'TEST_MODE',
      openai_model: 'gpt-5',
      ai_provider: 'openai',
    };
    settings.forEach((s) => {
      map[s.key] = s.value;
    });
    return map;
  } catch (err) {
    return { ai_mode: 'TEST_MODE', openai_model: 'gpt-5', ai_provider: 'openai' };
  }
}

export async function updateSystemSetting(key: string, value: string, description?: string) {
  return await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value,
      description: description || '',
    },
    update: {
      value,
      ...(description ? { description } : {}),
    },
  });
}

