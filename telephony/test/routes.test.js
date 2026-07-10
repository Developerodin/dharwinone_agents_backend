import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

process.env.TWILIO_AUTH_ID = 'AC00000000000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'testauthtoken';
process.env.TWILIO_API_SID = 'SK00000000000000000000000000000000';
process.env.TWILIO_API_SECRET = 'testapisecret';
process.env.TWILIO_TWIML_APP_SID = 'AP00000000000000000000000000000000';
process.env.TWILIO_PHONE_NUMBER = '+15005550006';
process.env.TWILIO_WEBHOOK_BASE_URL = 'https://example.com';
process.env.TWILIO_VERIFY_WEBHOOKS = 'false';
process.env.AUTH_JWT_SECRET = 'test-secret';

// No Mongo in unit tests: fail fast, persistence is fire-and-forget in webhooks.
mongoose.set('bufferCommands', false);

const { createApp } = await import('../src/app.js');

function listen() {
  return new Promise((resolve) => {
    const server = createApp().listen(0, () => resolve(server));
  });
}

test('POST /api/telephony/token returns a signed JWT', async () => {
  const server = await listen();
  const now = Math.floor(Date.now() / 1000);
  const bearer = jwt.sign(
    { sub: 'usr-1', iat: now, exp: now + 600, iss: 'dharwin-auth', aud: 'dharwin-api' },
    'test-secret',
  );
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/telephony/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.match(body.token, /^eyJ/);
  server.close();
});

test('POST /public/voice returns Dial TwiML for a valid destination', async () => {
  const server = await listen();
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/telephony/public/voice`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+919876543210', CallSid: 'CA' + '0'.repeat(32), From: 'client:dharwin_agent' }),
    },
  );
  const xml = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/xml/);
  assert.match(xml, /<Dial/);
  assert.match(xml, /\+919876543210/);
  server.close();
});

test('POST /public/voice hangs up on a garbage destination', async () => {
  const server = await listen();
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/telephony/public/voice`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '', CallSid: 'CA' + '1'.repeat(32) }),
    },
  );
  const xml = await res.text();
  assert.match(xml, /<Hangup\/>/);
  server.close();
});

test('POST /public/call-status returns empty TwiML', async () => {
  const server = await listen();
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/telephony/public/call-status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ CallSid: 'CA' + '2'.repeat(32), CallStatus: 'ringing' }),
    },
  );
  const xml = await res.text();
  assert.equal(res.status, 200);
  assert.match(xml, /<Response><\/Response>/);
  server.close();
});
