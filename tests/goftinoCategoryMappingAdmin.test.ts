import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin policy panel exposes active-category mapping and incomplete warnings', () => {
  const panel = source('src/components/GoftinoAiResponsePolicyPanel.tsx');
  assert.match(panel, /payload\.categories/);
  assert.match(panel, /configuredCategoryId/);
  assert.match(panel, /saveCategory/);
  assert.match(panel, /تنظیمات ناقص/);
  assert.match(panel, /row\.warning/);
});

test('backend validates and stores category mappings by stable ids in SystemSetting', () => {
  const service = source('server/services/goftinoAiPolicyService.ts');
  assert.match(service, /where: \{ status: 'ACTIVE' \}/);
  assert.match(service, /goftinoCategorySettingKey\(topicId\)/);
  assert.match(service, /value: selectedCategory\.id/);
  assert.match(service, /prisma\.\$transaction/);
  assert.doesNotMatch(service, /topicId\s*===\s*['"]claims/);
  assert.doesNotMatch(service, /topic\.title.*خسارت/);
});

test('policy mapping update is restricted to administrators', () => {
  const routes = source('server/routes/index.ts');
  assert.match(
    routes,
    /['"]\/settings\/ai-response-policies\/:id['"][\s\S]*?authenticateToken,[\s\S]*?requireRole\(\['ADMIN'\]\),[\s\S]*?updateAiResponsePolicyController/,
  );
});

test('resolved category id continues through the existing Brain Layer retrieval contract', () => {
  const pipeline = source('server/services/aiPipelineService.ts');
  const retrieval = source('server/services/knowledgeRetrievalService.ts');
  assert.match(pipeline, /allowedCategoryId: policyDecision\.kind === 'ALLOW' \? policyDecision\.policy\.insuranceCategoryId/);
  assert.match(pipeline, /restrictKnowledgeScope: true/);
  assert.match(retrieval, /matchedCategoryRaw = activeCategories\.find/);
  assert.match(retrieval, /categoryKnowledgeScope\(matchedCategoryRaw\.id\)/);
  assert.match(retrieval, /rule\.category === categoryScope/);
});
