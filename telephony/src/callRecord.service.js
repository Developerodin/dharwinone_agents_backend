import CallRecord, { resolveStatusUpdate } from './callRecord.model.js';

/**
 * Idempotent upsert keyed by Twilio CallSid. Copied from
 * uat.dharwin.backend callRecord.service.js, minus Bolna/RBAC concerns.
 * Mongo-glue only — the status guard logic is pure and tested in
 * callRecord.model.js; this function is covered by the manual E2E call.
 */
export async function upsertDialerCallRecord({
  executionId,
  toPhoneNumber,
  fromPhoneNumber,
  status,
  duration,
  direction,
  recordingUrl,
} = {}) {
  if (!executionId) return null;
  const set = {};
  if (toPhoneNumber) set.toPhoneNumber = String(toPhoneNumber);
  if (fromPhoneNumber) set.fromPhoneNumber = String(fromPhoneNumber);
  if (duration != null && !Number.isNaN(Number(duration))) set.duration = Number(duration);
  if (recordingUrl) set.recordingUrl = String(recordingUrl);
  set['telephonyData.provider'] = 'twilio';
  if (direction) set['telephonyData.direction'] = direction;

  if (status) {
    const existing = await CallRecord.findOne({ executionId: String(executionId) })
      .select('status statusRank')
      .lean();
    const update = resolveStatusUpdate(existing, status);
    if (update) {
      set.status = update.status;
      set.statusRank = update.statusRank;
      set.statusUpdatedAt = new Date();
      if (update.terminal) set.completedAt = new Date();
    }
  }

  return CallRecord.findOneAndUpdate(
    { executionId: String(executionId) },
    { $set: set, $setOnInsert: { executionId: String(executionId), source: 'initiate' } },
    { new: true, upsert: true },
  ).lean();
}

export async function listCallRecords({ limit = 50, page = 1 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pg = Math.max(Number(page) || 1, 1);
  const [results, total] = await Promise.all([
    CallRecord.find({}).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    CallRecord.countDocuments({}),
  ]);
  return { results, total, page: pg, limit: lim };
}

export async function getCallRecord(callSid) {
  if (!callSid) return null;
  return CallRecord.findOne({ executionId: String(callSid) }).lean();
}

/** Allow-list patch: only notes and tags are settable — no mass-assignment. */
export async function patchCallRecord(callSid, patch = {}) {
  if (!callSid) return null;
  const $set = {};
  if (patch.notes !== undefined) $set.notes = String(patch.notes);
  if (Array.isArray(patch.tags)) $set.tags = patch.tags.map(String);
  if (!Object.keys($set).length) return getCallRecord(callSid);
  return CallRecord.findOneAndUpdate(
    { executionId: String(callSid) },
    { $set },
    { new: true },
  ).lean();
}
