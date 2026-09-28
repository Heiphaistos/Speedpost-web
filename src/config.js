import 'dotenv/config';
import path from 'node:path';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|oui|on)$/i.test(String(v)));

/** Configuration (variables d'environnement, voir .env.example). */
export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || './data');
  return {
    host: env.HOST || '127.0.0.1',
    port: num(env.PORT, 3080),
    publicUrl: String(env.PUBLIC_URL || `http://localhost:${num(env.PORT, 3080)}`).replace(/\/+$/, ''),
    trustProxy: bool(env.TRUST_PROXY, true),
    dataDir,
    dbPath: env.DATABASE_PATH || path.join(dataDir, 'speedpost.db'),
    // Envoi : 'open' (tout le monde, sans compte), 'password' (mot de passe d'envoi partagé)
    uploadPassword: env.UPLOAD_PASSWORD || '',
    maxFileBytes: num(env.MAX_FILE_MB, 10240) * 1024 * 1024,
    maxFilesPerTransfer: num(env.MAX_FILES, 200),
    quotaBytes: num(env.QUOTA_GB, 200) * 1024 * 1024 * 1024,
    defaultDays: num(env.DEFAULT_DAYS, 7),
    maxDays: num(env.MAX_DAYS, 30),
    // E-mail facultatif : sans SMTP, le lien se partage tel quel (ou via la messagerie de l'expéditeur)
    smtpUrl: env.SMTP_URL || '',
    mailFrom: env.MAIL_FROM || '',
    appName: env.APP_NAME || 'SpeedPost',
    secret: env.SECRET || '',
  };
}
