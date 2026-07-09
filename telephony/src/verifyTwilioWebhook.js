import config from './config.js';
import * as twilioService from './twilio.service.js';

/** Reconstruct the exact public URL Twilio signed (honouring proxy headers). */
function buildPublicUrl(req) {
  const proto = req.get('X-Forwarded-Proto') || req.protocol || 'https';
  const host = req.get('X-Forwarded-Host') || req.get('host');
  return `${proto}://${host}${req.originalUrl}`;
}

/** Validate the Twilio webhook signature (X-Twilio-Signature). */
export function verifyTwilioWebhook(req, res, next) {
  if (!twilioService.shouldVerifyWebhooks()) return next();

  if (!(config.twilio.authToken || '').trim()) {
    return res.status(503).json({
      success: false,
      error: 'TWILIO_AUTH_TOKEN is not configured for webhook validation.',
    });
  }

  const signature = req.get('X-Twilio-Signature') || '';
  if (!signature) {
    console.warn(`[Twilio] webhook rejected: missing signature for ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ success: false, error: 'Missing Twilio signature' });
  }

  const url = buildPublicUrl(req);
  const valid = twilioService.validateSignature(
    signature,
    url,
    req.body && typeof req.body === 'object' ? req.body : {},
  );
  if (!valid) {
    console.warn(`[Twilio] webhook rejected: invalid signature for ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ success: false, error: 'Invalid Twilio signature' });
  }

  return next();
}
