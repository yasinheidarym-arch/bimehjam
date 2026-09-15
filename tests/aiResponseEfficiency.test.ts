import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiBehaviorSystemPrompt,
  classifyConversationIntentOnce,
  resolveAiBehaviorRulesFromRecords,
  type AiBehaviorRuleRecord,
} from '../server/services/aiBehaviorRuntime';

const shortResponseDirective = 'پاسخ‌ها را کوتاه، مستقیم و متناسب با سؤال کاربر بده. جزئیات اضافه، مثال‌های متعدد و فهرست‌های طولانی فقط زمانی ارائه شوند که برای رفع ابهام ضروری باشند یا کاربر درخواست توضیح بیشتر کرده باشد. در جریان فروش و استعلام، هر نوبت فقط یک هدف داشته باشد.';

test('an already classified intent is reused without another classifier call', async () => {
  const preclassified = {
    output: { intent: 'Insurance Quotation' as const, confidence: 0.91, reason: 'explicit quote request' },
    resolution: {
      promptVersion: 'ai-behavior-runtime-v1' as const,
      resolvedAt: new Date(0).toISOString(),
      context: { channel: 'GOFTINO' },
      candidates: [], selected: [], rejected: [],
    },
    promptVersion: 'ai-behavior-runtime-v1' as const,
    usage: { promptTokens: 1, completionTokens: 1 },
    model: 'test-model',
  };

  const result = await classifyConversationIntentOnce({
    message: 'بیمه مسئولیت می‌خواستم',
    recentMessages: [],
    context: { channel: 'GOFTINO' },
  }, preclassified);

  assert.strictEqual(result, preclassified);
});

function resolvedShortResponsePrompt() {
  const records: AiBehaviorRuleRecord[] = [{
    id: 'existing-simplicity-rule',
    title: 'سادگی پاسخ‌ها',
    directive: shortResponseDirective,
    category: 'CUSTOM',
    enforcementLevel: 'STRICT',
    status: 'ACTIVE',
    sortOrder: 21,
  }];
  const resolution = resolveAiBehaviorRulesFromRecords(records, {
    channel: 'GOFTINO', messageType: 'CUSTOMER_MESSAGE', userRole: 'CUSTOMER',
  });
  const prompt = buildAiBehaviorSystemPrompt(resolution, 'به پیام کاربر پاسخ بده.');
  assert.equal(resolution.selected.length, 1);
  return prompt;
}

test('A: a broad responsibility request is constrained to a short answer and one discriminator', () => {
  const prompt = resolvedShortResponsePrompt();
  assert.match(prompt, /پاسخ‌ها را کوتاه، مستقیم/);
  assert.match(prompt, /فهرست‌های طولانی فقط زمانی/);
  assert.match(prompt, /هر نوبت فقط یک هدف/);
});

test('B: a simple informational answer stays short and sufficient', () => {
  const prompt = resolvedShortResponsePrompt();
  assert.match(prompt, /متناسب با سؤال کاربر/);
  assert.match(prompt, /جزئیات اضافه/);
});

test('C: an explicit request for more detail permits a fuller answer', () => {
  const prompt = resolvedShortResponsePrompt();
  assert.match(prompt, /درخواست توضیح بیشتر/);
});

test('D: a sales or quotation turn has one clear action', () => {
  const prompt = resolvedShortResponsePrompt();
  assert.match(prompt, /هر نوبت فقط یک هدف/);
});
