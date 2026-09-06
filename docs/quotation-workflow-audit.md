# Quotation conversation audit (2026-09-06)

## Active path

Goftino webhook → `runAiPipelineForMessage` → mode/policy gates →
per-conversation queue → `processBrainLayer` → product/link decision →
`QuotationSession` → `advanceQuotationTurn` → transactional answer/session
persistence → exact stored next question → contact/confirmation → actual task.

The manual `/api/ai/process-message` endpoint now uses the same pipeline instead
of the legacy Gemini extractor. Retried message IDs with a persisted AI reply
are ignored. The queue covers the complete turn, not just the model call.

## Shared causes addressed

- Independent option/question parsers and unscoped numeric extraction allowed
  questions, negations and unrelated numbers to become answers.
- Bare Persian `نه` was also a number word (nine).
- Two unsuccessful attempts produced a terminal-sounding reply, although the
  session remained open.
- Answer rows and session progress were separate writes; parallel turns could
  interpret the same pending question.
- The interruption model received general rules and could generate additional
  quotation questions. It now only selects verbatim relevant product knowledge;
  the backend appends the exact stored question.
- Corrections at final confirmation were interpreted as profile/confirmation
  messages instead of revisiting the existing questionnaire session.

## Contract

`QuotationSession.collectedData` and its real workflow questions are authoritative.
Conversation `quotationTurnState` stores session ID, question schema/options,
answers, per-field attempts, ambiguity and last answered field. It is never used
instead of fresh session answers. Model selections require a known field, exact
evidence from the customer message and confidence >= 0.85; numeric limits and
canonical options remain backend-validated. Multiple answers require explicit
field labels. Ambiguity preserves all prior answers and offers help, not a stop.

BrainLog contains the question before processing, decisions/reasons/confidence,
saved field names and state after processing. No schema change is needed.

## Validation and scope

`npm run test:quotation-workflow` includes a mock-persisted conversation suite;
no production chat, model request, database or SMS is used by the suite.
It covers completion, numeric forms/ranges, colloquial options, interruptions,
combined answers, correction, ambiguity, invented model outputs and concurrency.
Product/link routing and final contact/confirmation have separate regression tests.

The queue is process-local, appropriate for the current single app process.
Horizontal replication would require a distributed lock/idempotent outbox and
separate infrastructure/schema review. Delivery across a process crash is not
claimed to be exactly-once. The dormant legacy `processAiConversation` implementation
has no active controller caller; its unrelated TypeScript errors remain in the
existing lint baseline. These tests mock semantic model responses; live linguistic
quality is not asserted by deterministic fixture tests.
