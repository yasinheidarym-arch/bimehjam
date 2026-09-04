import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editor = readFileSync('src/components/KnowledgeBaseEditor.tsx', 'utf8');

test('all badge collections are prefetched on initial mount without a tab click', () => {
  assert.match(editor, /const KNOWLEDGE_MODULE_TABS: ModuleTab\[\] = \['categories', 'products', 'faqs', 'ai-behavior'\]/);
  assert.match(editor, /useEffect\(\(\) => \{\s*void loadAllModules\(\);\s*\}, \[\]\)/);
});

test('badges start in loading state and never render an initial fake zero', () => {
  assert.match(editor, /categories: 'loading'/);
  assert.match(editor, /moduleLoadState\.categories === 'loading' \? <Loader2/);
  assert.match(editor, /moduleLoadState\.products === 'loading' \? <Loader2/);
  assert.match(editor, /moduleLoadState\.faqs === 'loading' \? <Loader2/);
  assert.match(editor, /moduleLoadState\['ai-behavior'\] === 'loading' \? <Loader2/);
});

test('category and product mutations force the shared counts to refresh', () => {
  assert.match(editor, /await loadModule\('categories', true\)/);
  assert.match(editor, /Promise\.all\(\[loadModule\('products', true\), loadModule\('categories', true\)\]\)/);
});

test('tab navigation uses cached data and in-flight requests are deduplicated', () => {
  assert.match(editor, /inFlightModulesRef\.current\.get\(tab\)/);
  assert.match(editor, /loadedModulesRef\.current\.has\(tab\)/);
  assert.match(editor, /void loadModule\(activeTab\)/);
});
