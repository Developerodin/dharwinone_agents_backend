import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TWILIO_AUTH_ID = 'AC00000000000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'testauthtoken';
process.env.TWILIO_API_SID = 'SK00000000000000000000000000000000';
process.env.TWILIO_API_SECRET = 'testapisecret';
process.env.TWILIO_TWIML_APP_SID = 'AP00000000000000000000000000000000';
process.env.TWILIO_PHONE_NUMBER = '+15005550006';
process.env.TWILIO_VERIFY_WEBHOOKS = 'true';

const { createApp } = await import('../src/app.js');

test('webhook without X-Twilio-Signature is rejected 401', async () => {
  const server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/telephony/public/voice`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+919876543210' }),
    },
  );
  assert.equal(res.status, 401);
  server.close();
});

test('webhook with a forged signature is rejected 401', async () => {
  const server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/telephony/public/voice`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': 'forged==',
      },
      body: new URLSearchParams({ To: '+919876543210' }),
    },
  );
  assert.equal(res.status, 401);
  server.close();
});
