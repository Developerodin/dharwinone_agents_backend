import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Single shared env file at backend/.env (holds STUDIO_* and TWILIO_* vars).
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const env = process.env;

export default {
  port: Number(env.PORT || 8788),
  mongoUri: env.MONGO_URI || 'mongodb://127.0.0.1:27017/dharwinone',
  authJwtSecret: env.AUTH_JWT_SECRET || '',
  twilio: {
    accountSid: env.TWILIO_AUTH_ID || '',
    authToken: env.TWILIO_AUTH_TOKEN || '',
    apiKeySid: env.TWILIO_API_SID || '',
    apiKeySecret: env.TWILIO_API_SECRET || '',
    twimlAppSid: env.TWILIO_TWIML_APP_SID || '',
    phoneNumber: env.TWILIO_PHONE_NUMBER || '',
    webhookBaseUrl: env.TWILIO_WEBHOOK_BASE_URL || '',
    verifyWebhooks: env.TWILIO_VERIFY_WEBHOOKS !== 'false',
  },
};
