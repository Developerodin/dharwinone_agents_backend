import config from './config.js';
import * as twilioService from './twilio.service.js';
import * as callRecordService from './callRecord.service.js';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Parent browser leg CallSid — child PSTN legs also send ParentCallSid. */
function resolveDialerExecutionId(body) {
  const parent = body?.ParentCallSid || body?.parentCallSid || '';
  const self = body?.CallSid || body?.callSid || '';
  return String(parent || self).trim();
}

function sendTwiml(res, xml) {
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(xml);
}

/** POST /api/telephony/token — Voice SDK access token for the browser. */
export function token(req, res) {
  const result = twilioService.createAccessToken();
  if (!result.success) return res.status(503).json(result);
  return res.json(result);
}

/** POST /api/telephony/public/voice — TwiML App Voice URL (browser outbound). */
export async function outboundVoice(req, res) {
  try {
    const body = req.body || {};
    const destination = twilioService.toDialE164(body.To || body.PhoneNumber || '');
    const callerId = twilioService.toE164(config.twilio.phoneNumber);

    if (!destination || !callerId) {
      return sendTwiml(res, twilioService.buildHangupTwiml('Unable to connect your call.'));
    }

    // Seed the CallRecord keyed by CallSid so the call shows in reports.
    // Fire-and-forget: TwiML must go back to Twilio promptly regardless of Mongo.
    const callSid = body.CallSid || '';
    if (callSid) {
      callRecordService
        .upsertDialerCallRecord({
          executionId: callSid,
          toPhoneNumber: destination,
          fromPhoneNumber: callerId,
          status: 'initiated',
          direction: 'outbound',
        })
        .catch((e) => console.warn(`[Twilio] dialer record seed failed: ${e?.message}`));
    }

    return sendTwiml(res, twilioService.buildOutboundTwiml({ to: destination, callerId }));
  } catch (err) {
    console.warn(`[Twilio] voice outbound error: ${err?.message}`);
    return sendTwiml(res, twilioService.buildHangupTwiml());
  }
}

/** POST /api/telephony/public/call-status — status + Dial action callback. */
export async function callStatusWebhook(req, res) {
  const body = req.body || {};
  const executionId = resolveDialerExecutionId(body);
  if (executionId) {
    // `From` is `client:dharwin_agent` for browser legs — don't store it as a phone.
    const fromIsPhone = body.From && !String(body.From).startsWith('client:');
    callRecordService
      .upsertDialerCallRecord({
        executionId,
        status: body.CallStatus,
        duration: body.CallDuration != null ? parseInt(body.CallDuration, 10) : undefined,
        toPhoneNumber: body.To && !String(body.To).startsWith('client:') ? body.To : undefined,
        fromPhoneNumber: fromIsPhone ? body.From : undefined,
        direction: 'outbound',
      })
      .catch((e) => console.warn(`[Twilio] call-status persist failed: ${e?.message}`));
  }
  return sendTwiml(res, EMPTY_TWIML);
}

/** POST /api/telephony/public/recording — recordingStatusCallback from <Dial record>. */
export async function recordingWebhook(req, res) {
  const body = req.body || {};
  const callSid = resolveDialerExecutionId(body);
  const recordingUrl = body.RecordingUrl || '';
  if (callSid && String(body.RecordingStatus || '').toLowerCase() === 'completed' && recordingUrl) {
    callRecordService
      .upsertDialerCallRecord({
        executionId: callSid,
        recordingUrl,
        duration: body.RecordingDuration != null ? parseInt(body.RecordingDuration, 10) : undefined,
        direction: 'outbound',
      })
      .catch((e) => console.warn(`[Twilio] recording persist failed: ${e?.message}`));
  }
  return res.status(200).json({ success: true });
}

/** GET /api/telephony/call-records */
export async function listRecords(req, res) {
  try {
    const data = await callRecordService.listCallRecords({
      limit: req.query.limit,
      page: req.query.page,
    });
    return res.json({ success: true, ...data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to list call records' });
  }
}

/** GET /api/telephony/call-records/:callSid */
export async function getRecord(req, res) {
  try {
    const record = await callRecordService.getCallRecord(req.params.callSid);
    if (!record) return res.status(404).json({ success: false, error: 'Call record not found' });
    return res.json({ success: true, record });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to load call record' });
  }
}

/** PATCH /api/telephony/call-records/:callSid — notes/tags only. */
export async function patchRecord(req, res) {
  try {
    const record = await callRecordService.patchCallRecord(req.params.callSid, req.body || {});
    if (!record) return res.status(404).json({ success: false, error: 'Call record not found' });
    return res.json({ success: true, record });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update call record' });
  }
}

/** GET /api/telephony/call-records/:callSid/recording — proxied media stream. */
export async function streamRecording(req, res) {
  try {
    const record = await callRecordService.getCallRecord(req.params.callSid);
    if (!record?.recordingUrl) {
      return res.status(404).json({ success: false, message: 'No recording available.' });
    }
    const url = String(record.recordingUrl);
    const media = url.endsWith('.mp3') || url.endsWith('.wav') ? url : `${url}.mp3`;
    return twilioService.proxyRecordingMedia(media, req, res);
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to stream recording' });
  }
}
