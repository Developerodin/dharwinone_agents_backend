/**
 * Twilio core, copied from uat.dharwin.backend src/services/twilio.service.js
 * and trimmed to: access tokens, outbound TwiML, webhook signature validation,
 * recording media proxy. No Plivo, no inbound, no Intelligence, no S3.
 */
import http from 'node:http';
import https from 'node:https';
import twilio from 'twilio';
import config from './config.js';
import { normalizePhone, validatePhone } from './phone.js';

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const VoiceResponse = twilio.twiml.VoiceResponse;

// ponytail: single shared identity — the app has no user auth yet. Switch to
// per-user identities when auth lands.
export const CLIENT_IDENTITY = 'dharwin_agent';

/** E.164 with leading + for storage, display, and Twilio dial targets. */
export function toE164(phone) {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/** Dial destination with country-code inference (10-digit → +91 default). */
export function toDialE164(phone) {
  return normalizePhone(String(phone || '')) || toE164(phone);
}

function getWebhookBaseUrl() {
  const raw = config.twilio.webhookBaseUrl;
  if (!raw) return '';
  try {
    const parsed = new URL(String(raw).trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return String(raw).trim().replace(/\/$/, '');
  }
}

function buildWebhookUrl(path) {
  const base = getWebhookBaseUrl();
  if (!base) return '';
  return `${base}/api/telephony/public${path}`;
}

/**
 * Sign a short-lived Access Token with a VoiceGrant.
 * incomingAllow: false — outbound-only per spec (no inbound calling).
 */
export function createAccessToken(opts = {}) {
  const { accountSid, apiKeySid, apiKeySecret, twimlAppSid } = config.twilio;
  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return {
      success: false,
      error:
        'Twilio token signing requires TWILIO_AUTH_ID, TWILIO_API_SID, TWILIO_API_SECRET and TWILIO_TWIML_APP_SID.',
    };
  }
  const ttl = Number.isFinite(opts.ttl) ? opts.ttl : 3600;
  const grant = new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: false });
  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: CLIENT_IDENTITY,
    ttl,
  });
  token.addGrant(grant);
  return { success: true, token: token.toJwt(), identity: CLIENT_IDENTITY, ttl };
}

/**
 * Outbound TwiML — returned from the TwiML App Voice URL. Dials the PSTN
 * destination from the configured caller id and records the leg dual-channel.
 */
export function buildOutboundTwiml({ to, callerId }) {
  const response = new VoiceResponse();
  const destination = toDialE164(to);

  if (!destination || !validatePhone(destination)) {
    response.say('Sorry, that number could not be dialed. Please check the number and try again.');
    response.hangup();
    return response.toString();
  }

  const dialAttrs = {
    callerId: toE164(callerId) || config.twilio.phoneNumber,
    record: 'record-from-answer-dual',
    answerOnBridge: true,
  };
  const recCb = buildWebhookUrl('/recording');
  if (recCb) {
    dialAttrs.recordingStatusCallback = recCb;
    dialAttrs.recordingStatusCallbackEvent = 'completed';
    dialAttrs.recordingStatusCallbackMethod = 'POST';
  }

  const dial = response.dial(dialAttrs);
  const numberAttrs = {};
  const statusCb = buildWebhookUrl('/call-status');
  if (statusCb) {
    numberAttrs.statusCallback = statusCb;
    numberAttrs.statusCallbackEvent = 'initiated ringing answered completed';
    numberAttrs.statusCallbackMethod = 'POST';
  }
  dial.number(numberAttrs, destination);

  return response.toString();
}

export function buildHangupTwiml(message = 'Unable to connect your call. Please try again.') {
  const response = new VoiceResponse();
  response.say(String(message));
  response.hangup();
  return response.toString();
}

export function shouldVerifyWebhooks() {
  return config.twilio.verifyWebhooks;
}

/** Validate an incoming Twilio webhook signature (form-encoded webhooks). */
export function validateSignature(signature, url, params = {}) {
  const { authToken } = config.twilio;
  if (!authToken || !signature) return false;
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (err) {
    console.warn(`[Twilio] signature validation error: ${err?.message}`);
    return false;
  }
}

/**
 * Stream a Twilio recording's media to the response with account Basic Auth,
 * forwarding Range headers so the player can seek. Copied from source.
 */
export function proxyRecordingMedia(recordingUrl, req, res) {
  const { accountSid, authToken } = config.twilio;
  if (!recordingUrl) {
    res.status(404).json({ success: false, message: 'No recording available.' });
    return Promise.resolve();
  }
  if (!accountSid || !authToken) {
    res.status(503).json({ success: false, message: 'Twilio credentials not configured.' });
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(String(recordingUrl));
    } catch {
      res.status(400).json({ success: false, message: 'Invalid recording URL.' });
      return resolve();
    }

    const transport = target.protocol === 'http:' ? http : https;
    const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
    const headers = { Authorization: authHeader };
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = transport.request(target, { method: 'GET', headers }, (up) => {
      res.status(up.statusCode || 200);
      for (const name of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
        if (up.headers[name]) res.setHeader(name, up.headers[name]);
      }
      if (!up.headers['content-type']) res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      up.pipe(res);
      up.on('end', resolve);
      up.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        resolve();
      });
    });

    upstream.on('error', (err) => {
      console.warn(`[Twilio] recording media proxy failed: ${err?.message}`);
      if (!res.headersSent) res.status(502).json({ success: false, message: 'Failed to fetch recording.' });
      resolve();
    });

    req.on('close', () => upstream.destroy());
    upstream.end();
  });
}
