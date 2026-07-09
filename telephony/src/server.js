import mongoose from 'mongoose';
import config from './config.js';
import { createApp } from './app.js';

// Fail fast instead of buffering forever when Mongo is down — webhook
// persistence is best-effort (caught in the controller) either way.
mongoose.set('bufferCommands', false);
mongoose
  .connect(config.mongoUri)
  .then(() => console.log(`[telephony] Mongo connected: ${config.mongoUri}`))
  .catch((e) => console.warn(`[telephony] Mongo connect failed (records disabled): ${e.message}`));

const app = createApp();
app.listen(config.port, () => {
  console.log(`[telephony] listening on http://localhost:${config.port}`);
});
