import express from 'express';
import cors from 'cors';
import { verifyTwilioWebhook } from './verifyTwilioWebhook.js';
import * as controller from './controller.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  // Twilio posts webhooks form-encoded.
  app.use(express.urlencoded({ extended: false }));

  app.get('/health', (req, res) => res.json({ ok: true, service: 'dharwin-telephony' }));

  app.post('/api/telephony/token', controller.token);

  app.post('/api/telephony/public/voice', verifyTwilioWebhook, controller.outboundVoice);
  app.post('/api/telephony/public/call-status', verifyTwilioWebhook, controller.callStatusWebhook);
  app.post('/api/telephony/public/recording', verifyTwilioWebhook, controller.recordingWebhook);

  app.get('/api/telephony/call-records', controller.listRecords);
  app.get('/api/telephony/call-records/:callSid', controller.getRecord);
  app.patch('/api/telephony/call-records/:callSid', controller.patchRecord);
  app.get('/api/telephony/call-records/:callSid/recording', controller.streamRecording);

  return app;
}
