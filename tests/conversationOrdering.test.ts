import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conversationPageIds,
  sortConversationsByActivity,
  type ConversationActivity,
} from '../shared/conversationOrdering';

const rows: ConversationActivity[] = [
  { id: 'conversation-c', lastMessageAt: '2026-10-01T08:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'conversation-a', lastMessageAt: '2026-10-03T08:00:00.000Z', createdAt: '2026-09-03T00:00:00.000Z' },
  { id: 'conversation-b', lastMessageAt: '2026-10-02T08:00:00.000Z', createdAt: '2026-09-02T00:00:00.000Z' },
];

test('selection, unread and metadata changes do not change conversation order', () => {
  const initial = sortConversationsByActivity(rows);
  const selectedId = 'conversation-b';
  const afterSelection = initial.map((row) => row.id === selectedId
    ? { ...row, unreadCount: 0, status: 'WAITING_FOR_EXPERT', updatedAt: '2027-01-01T00:00:00.000Z' }
    : row);

  assert.deepEqual(sortConversationsByActivity(afterSelection).map((row) => row.id), [
    'conversation-a', 'conversation-b', 'conversation-c',
  ]);
  assert.equal(selectedId, 'conversation-b');
});

test('new inbound or outbound message moves only that conversation to the first row', () => {
  const inbound = rows.map((row) => row.id === 'conversation-c'
    ? { ...row, lastMessageAt: '2026-10-04T08:00:00.000Z' }
    : row);
  assert.equal(sortConversationsByActivity(inbound)[0].id, 'conversation-c');

  const outbound = rows.map((row) => row.id === 'conversation-b'
    ? { ...row, lastMessageAt: '2026-10-05T08:00:00.000Z' }
    : row);
  assert.equal(sortConversationsByActivity(outbound)[0].id, 'conversation-b');
});

test('refresh preserves activity order and equal timestamps use deterministic IDs', () => {
  const tied = [
    { id: 'conversation-z', lastMessageAt: '2026-10-03T08:00:00.000Z', createdAt: '2026-09-02T00:00:00.000Z' },
    { id: 'conversation-a', lastMessageAt: '2026-10-03T08:00:00.000Z', createdAt: '2026-09-03T00:00:00.000Z' },
  ];
  const first = sortConversationsByActivity(tied).map((row) => row.id);
  const refreshed = sortConversationsByActivity([...tied].reverse()).map((row) => row.id);
  assert.deepEqual(first, ['conversation-a', 'conversation-z']);
  assert.deepEqual(refreshed, first);
});

test('conversation without messages falls back to createdAt', () => {
  const sorted = sortConversationsByActivity([
    { id: 'without-message', lastMessageAt: null, createdAt: '2026-10-04T08:00:00.000Z' },
    { id: 'with-message', lastMessageAt: '2026-10-03T08:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
  ]);
  assert.equal(sorted[0].id, 'without-message');
});

test('pagination happens after sorting without duplicates or missing conversations', () => {
  const pageOne = conversationPageIds(rows, 1, 2);
  const pageTwo = conversationPageIds(rows, 2, 2);
  assert.deepEqual(pageOne, ['conversation-a', 'conversation-b']);
  assert.deepEqual(pageTwo, ['conversation-c']);
  assert.equal(new Set([...pageOne, ...pageTwo]).size, rows.length);
});
