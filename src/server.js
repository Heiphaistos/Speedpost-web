import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const app = await buildApp(config, { logger: { level: process.env.LOG_LEVEL || 'info' } });
const removed = app.purge();
await app.listen({ host: config.host, port: config.port });
app.log.info(`${config.appName} disponible sur ${config.publicUrl} (écoute ${config.host}:${config.port})${removed ? ` — ${removed} transfert(s) expiré(s) supprimé(s)` : ''}`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { app.close().then(() => process.exit(0)); });
