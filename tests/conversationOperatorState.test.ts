import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationStatusAfterAiTurn } from '../shared/conversationOperatorState';
import { conversationIntentFamily, simpleGreetingReply } from '../server/services/aiBehaviorRuntime';

test('A/B: greeting and greeting with an introduced name stay AI-active', () => {
  assert.equal(simpleGreetingReply('سلام'), 'سلام، وقت بخیر، در خدمتم.');
  assert.equal(conversationIntentFamily('Greeting'), 'GREETING');
  assert.equal(conversationStatusAfterAiTurn({}), 'AI_HANDLING');
  assert.equal(conversationStatusAfterAiTurn({ handoffCompleted: false }), 'AI_HANDLING');
});

test('C/D: early or unknown intent and missing specialized knowledge never imply handoff', () => {
  assert.equal(conversationStatusAfterAiTurn({ deferHumanHandoff: false }), 'AI_HANDLING');
  assert.equal(conversationStatusAfterAiTurn({ handoffCompleted: false, deferHumanHandoff: false }), 'AI_HANDLING');
});

test('E: a grounded knowledge limitation remains AI-active', () => {
  assert.equal(conversationStatusAfterAiTurn({ handoffCompleted: false }), 'AI_HANDLING');
});

test('F/G: only a successfully completed operational handoff waits for an operator', () => {
  assert.equal(conversationStatusAfterAiTurn({ handoffCompleted: true, deferHumanHandoff: false }), 'WAITING_OPERATOR');
  assert.equal(conversationStatusAfterAiTurn({ handoffCompleted: true, deferHumanHandoff: true }), 'AI_HANDLING');
});

test('H: legacy policy fallback flags cannot move a conversation without successful work', () => {
  assert.equal(conversationStatusAfterAiTurn({ handoffCompleted: false, deferHumanHandoff: false }), 'AI_HANDLING');
});
