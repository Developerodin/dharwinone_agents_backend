import test from 'node:test';
import assert from 'node:assert/strict';

// Fake creds so token signing works offline. Set BEFORE importing config.
process.env.TWILIO_AUTH_ID = 'AC00000000000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'testauthtoken';
process.env.TWILIO_API_SID = 'SK00000000000000000000000000000000';
process.env.TWILIO_API_SECRET = 'testapisecret';
process.env.TWILIO_TWIML_APP_SID = 'AP00000000000000000000000000000000';
process.env.TWILIO_PHONE_NUMBER = '+15005550006';
process.env.TWILIO_WEBHOOK_BASE_URL = 'https://example.com';

const svc = await import('../src/twilio.service.js');

test('createAccessToken signs a JWT with the shared identity', () => {
  const result = svc.createAccessToken();
  assert.equal(result.success, true);
  assert.match(result.token, /^eyJ/);
  assert.equal(result.identity, svc.CLIENT_IDENTITY);
  assert.equal(result.ttl, 3600);
});

test('buildOutboundTwiml dials the destination with recording + callbacks', () => {
  const xml = svc.buildOutboundTwiml({ to: '+919876543210', callerId: '+15005550006' });
  assert.match(xml, /<Dial[^>]*callerId="\+15005550006"/);
  assert.match(xml, /record="record-from-answer-dual"/);
  assert.match(xml, /recordingStatusCallback="https:\/\/example.com\/api\/telephony\/public\/recording"/);
  assert.match(xml, /statusCallback="https:\/\/example.com\/api\/telephony\/public\/call-status"/);
  assert.match(xml, /\+919876543210/);
});

test('buildOutboundTwiml refuses an invalid destination', () => {
  const xml = svc.buildOutboundTwiml({ to: 'garbage', callerId: '+15005550006' });
  assert.match(xml, /<Hangup\/>/);
});

test('validateSignature rejects a bad signature', () => {
  assert.equal(
    svc.validateSignature('bogus', 'https://example.com/api/telephony/public/voice', { To: '+1' }),
    false,
  );
});
