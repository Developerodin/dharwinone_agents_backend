import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.AUTH_JWT_SECRET = 'test-secret';
process.env.TWILIO_VERIFY_WEBHOOKS = 'false';

const { requireAuth } = await import('../src/requireAuth.js');

const CLAIMS = { iss: 'dharwin-auth', aud: 'dharwin-api' };

function sign(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sub: 'usr-1', iat: now, exp: now + 600, ...CLAIMS, ...overrides },
    overrides.secret ?? 'test-secret',
  );
}

function run(req) {
  let status = null;
  let nexted = false;
  const request = { headers: {}, query: {}, ...req };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  requireAuth(request, res, () => {
    nexted = true;
  });
  return { status, nexted, req: request };
}

test('valid bearer token passes and sets userId', () => {
  const req = { headers: { authorization: `Bearer ${sign()}` }, query: {} };
  const out = run(req);
  assert.equal(out.nexted, true);
  assert.equal(out.req.userId, 'usr-1');
});

test('query token is NOT accepted (tokens never travel in URLs)', () => {
  const out = run({ headers: {}, query: { token: sign() } });
  assert.equal(out.status, 401);
  assert.equal(out.nexted, false);
});

test('missing token is 401', () => {
  const out = run({ headers: {}, query: {} });
  assert.equal(out.status, 401);
  assert.equal(out.nexted, false);
});

test('expired token is 401', () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign(
    { sub: 'usr-1', iat: now - 7200, exp: now - 3600, ...CLAIMS },
    'test-secret',
  );
  const out = run({ headers: { authorization: `Bearer ${expired}` }, query: {} });
  assert.equal(out.status, 401);
});

test('wrong issuer/audience/secret are 401', () => {
  for (const bad of [
    sign({ iss: 'evil' }),
    sign({ aud: 'evil' }),
    sign({ secret: 'other-secret' }),
  ]) {
    const out = run({ headers: { authorization: `Bearer ${bad}` }, query: {} });
    assert.equal(out.status, 401);
  }
});
