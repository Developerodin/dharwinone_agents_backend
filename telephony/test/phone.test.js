import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, validatePhone } from '../src/phone.js';

test('10-digit number defaults to India (+91)', () => {
  assert.equal(normalizePhone('8290918154'), '+918290918154');
});

test('US 11-digit with leading 1 keeps country code', () => {
  assert.equal(normalizePhone('15552345678'), '+15552345678');
});

test('already-E.164 input passes through', () => {
  assert.equal(normalizePhone('+919876543210'), '+919876543210');
});

test('validatePhone accepts only E.164', () => {
  assert.equal(validatePhone('+918290918154'), true);
  assert.equal(validatePhone('8290918154'), false);
  assert.equal(validatePhone('+0123'), false);
});
