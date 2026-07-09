import mongoose from 'mongoose';

/**
 * Status state machine copied from uat.dharwin.backend. `statusRank` enforces
 * monotonic forward progression so a late "ringing" webhook can never
 * overwrite a "completed" terminal status. Terminal statuses share rank 10.
 */
export const TERMINAL_STATUSES = [
  'completed',
  'failed',
  'no_answer',
  'busy',
  'call_disconnected',
  'expired',
];

export const STATUS_RANK = {
  unknown: 0,
  initiated: 1,
  ringing: 2,
  in_progress: 3,
  completed: 10,
  failed: 10,
  no_answer: 10,
  busy: 10,
  call_disconnected: 10,
  expired: 10,
};

export function rankOf(status) {
  if (!status) return 0;
  return STATUS_RANK[String(status).toLowerCase()] ?? 0;
}

export function isTerminal(status) {
  if (!status) return false;
  return TERMINAL_STATUSES.includes(String(status).toLowerCase());
}

export function normalizeStatus(status) {
  if (!status) return 'unknown';
  const s = String(status).toLowerCase().trim();
  const statusMap = {
    done: 'completed',
    finished: 'completed',
    ended: 'completed',
    success: 'completed',
    error: 'failed',
    errored: 'failed',
    cancelled: 'failed',
    canceled: 'failed',
    stopped: 'failed',
    initiate: 'initiated',
    initiated: 'initiated',
    'no-answer': 'no_answer',
    'call-disconnected': 'call_disconnected',
    'in-progress': 'in_progress',
    queued: 'initiated',
    ringing: 'in_progress',
  };
  return statusMap[s] || s;
}

/**
 * Pure decision for the monotonic status guard — unit-testable without Mongo.
 * Returns the fields to $set, or null when the incoming status must be ignored.
 */
export function resolveStatusUpdate(existing, incomingStatus) {
  if (!incomingStatus) return null;
  const st = normalizeStatus(incomingStatus);
  const incomingRank = rankOf(st);
  const existingRank = existing ? existing.statusRank ?? rankOf(existing.status) : -1;
  if (incomingRank < existingRank) return null;
  return { status: st, statusRank: incomingRank, terminal: isTerminal(st) };
}

const callRecordSchema = new mongoose.Schema(
  {
    /** Twilio CallSid of the parent browser leg. Unique per call. */
    executionId: { type: String, required: true, unique: true, index: true },
    source: { type: String, default: 'initiate' },
    status: { type: String, default: 'unknown', index: true },
    statusRank: { type: Number, default: 0 },
    statusUpdatedAt: { type: Date, default: Date.now },
    toPhoneNumber: { type: String, trim: true },
    fromPhoneNumber: { type: String, trim: true },
    duration: Number,
    recordingUrl: String,
    completedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
    tags: { type: [String], default: [] },
    /** provider + direction live here, mirroring the source schema. */
    telephonyData: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

callRecordSchema.index({ status: 1, createdAt: -1 });

const CallRecord =
  mongoose.models.CallRecord || mongoose.model('CallRecord', callRecordSchema);
export default CallRecord;
