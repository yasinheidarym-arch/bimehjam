import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readFaqs } from '../server/services/faqReadService.ts';
import { selectRelevantFaqsForCategory } from '../shared/faqKnowledge.ts';

test('two FAQ reads keep an empty store empty and return an empty collection', async () => {
  let readCount = 0;
  let writeCount = 0;
  const store = {
    fAQ: {
      findMany: async () => {
        readCount += 1;
        return [];
      },
      createMany: async () => {
        writeCount += 1;
        return { count: 1 };
      },
    },
  };

  const first = await readFaqs(store as never, {});
  const second = await readFaqs(store as never, {});

  assert.deepEqual(first, []);
  assert.deepEqual(second, []);
  assert.equal(readCount, 2);
  assert.equal(writeCount, 0);
});

test('knowledge retrieval accepts an empty FAQ collection', () => {
  assert.deepEqual(selectRelevantFaqsForCategory([], 'مسئولیت'), []);
  assert.deepEqual(selectRelevantFaqsForCategory([], 'خودرو'), []);
});

test('no runtime seed path can create FAQs while other seed sections remain', () => {
  const controller = readFileSync('server/controllers/knowledgeController.ts', 'utf8');
  const retrieval = readFileSync('server/services/knowledgeRetrievalService.ts', 'utf8');

  assert.doesNotMatch(controller, /fAQ\.createMany/);
  assert.doesNotMatch(retrieval, /fAQ\.createMany/);
  assert.match(controller, /responseTemplate\.createMany/);
  assert.match(retrieval, /customerObjection\.createMany/);
  assert.match(retrieval, /knowledgeArticle\.createMany/);
});

test('FAQ panel renders an explicit empty state', () => {
  const editor = readFileSync('src/components/KnowledgeBaseEditor.tsx', 'utf8');
  assert.match(editor, /هنوز پرسش و پاسخ متداولی ثبت نشده است/);
});
