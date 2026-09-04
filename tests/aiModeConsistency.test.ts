import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(path, 'utf8');

test('frontend indicators consume backend effectiveMode and do not calculate it locally', () => {
  const app = source('src/App.tsx');
  const conversations = source('src/components/ConversationManagementView.tsx');
  assert.doesNotMatch(app, /resolveEffectiveAiMode/);
  assert.match(app, /aiMode=\{effectiveAiMode\}/);
  assert.match(app, /res\?\.data\?\.effectiveMode/);
  assert.match(app, /onChange=\{\(event\) => handleAiScheduleEnabledChange\(event\.target\.checked\)\}/);
  assert.match(conversations, /setAiMode\(res\.data\.effectiveMode\)/);
});

test('API, webhook and pipeline share one backend effective mode decision', () => {
  const controller = source('server/controllers/settingController.ts');
  const goftino = source('server/services/goftinoService.ts');
  const pipeline = source('server/services/aiPipelineService.ts');
  assert.match(controller, /getAiModeStatus\(\)/);
  assert.match(goftino, /effectiveAiMode: currentAiMode/);
  assert.match(pipeline, /effectiveAiMode \?\? await getEffectiveAiMode\(\)/);
});
