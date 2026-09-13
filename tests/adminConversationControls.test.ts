import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync(new URL('../src/components/KnowledgeBaseEditor.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('category edit modal keeps header and footer visible with an independently scrollable body', () => {
  assert.match(editor, /max-h-\[calc\(100dvh-2rem\)\][^"\n]*flex flex-col/);
  assert.match(editor, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.match(editor, /border-t border-slate-200 bg-white[^"\n]*shrink-0/);
});

test('product alias and quotation SLA controls are administrator-editable', () => {
  assert.match(editor, /نام‌ها و عبارت‌های جایگزین برای تشخیص محصول/);
  assert.match(editor, /productForm\.detectionAliases/);
  assert.match(app, /quote_response_sla_minutes/);
  assert.match(app, /زمان هدف پاسخ کارشناس به استعلام/);
});

test('product form requires a subcategory in both submit handling and controls', () => {
  assert.match(editor, /!productForm\.categoryId \|\| !productForm\.subCategoryId/);
  assert.match(editor, /انتخاب زیر‌دسته برای هر محصول الزامی است/);
  assert.match(editor, /disabled=\{!productForm\.categoryId \|\| !productForm\.subCategoryId\}/);
});
