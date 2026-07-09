import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatus, resolveStatusUpdate, rankOf, isTerminal } from '../src/callRecord.model.js';

test('normalizeStatus maps Twilio webhook statuses', () => {
  assert.equal(normalizeStatus('in-progress'), 'in_progress');
  assert.equal(normalizeStatus('no-answer'), 'no_answer');
  assert.equal(normalizeStatus('queued'), 'initiated');
  assert.equal(normalizeStatus('ringing'), 'in_progress');
  assert.equal(normalizeStatus('completed'), 'completed');
  assert.equal(normalizeStatus(''), 'unknown');
});

test('late non-terminal status cannot overwrite a terminal one', () => {
  const existing = { status: 'completed', statusRank: 10 };
  assert.equal(resolveStatusUpdate(existing, 'ringing'), null);
  assert.equal(resolveStatusUpdate(existing, 'in-progress'), null);
});

test('equal-rank terminal update is allowed (enrichment)', () => {
  const existing = { status: 'completed', statusRank: 10 };
  const update = resolveStatusUpdate(existing, 'failed');
  assert.equal(update.status, 'failed');
  assert.equal(update.statusRank, 10);
});

test('forward progression on a fresh record', () => {
  const update = resolveStatusUpdate(null, 'initiated');
  assert.deepEqual(update, { status: 'initiated', statusRank: 1, terminal: false });
});

test('terminal detection', () => {
  assert.equal(isTerminal('completed'), true);
  assert.equal(isTerminal('no_answer'), true);
  assert.equal(isTerminal('in_progress'), false);
  assert.equal(rankOf('completed'), 10);
});
