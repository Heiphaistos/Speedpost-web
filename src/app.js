import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import { keyFromText, keyCheck, keyMatches, sealText, openText, filePrefix, decryptRange } from './cipher.js';
import { openDb, Store, newId, sha, safeEqual, cleanName, fmtSize, hashPassword, checkPassword, signKey, verifyKey } from './store.js';
import { createMailer } from './mail.js';

const PUBLIC_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i;
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/**
 * Application SpeedPost.
 * Protocole d'envoi : POST /api/transfers (clé dans x-transfer-key) → PUT …/files (morceaux) → POST …/finish.
 * La clé (256 bits) est générée par le client et ne vit que dans le lien de partage (/d/<id>#<clé>) : le serveur
 * s'en sert le temps d'une requête pour chiffrer ou déchiffrer, sans jamais l'enregistrer.
 */
export async function buildApp(config, { logger = false, mailer = createMailer(config) } = {}) {
  const db = openDb(config.dbPath);
  const store = new Store(config.dataDir);
  let secret = config.secret || db.prepare("SELECT v FROM kv WHERE k = 'secret'").get()?.v;
  if (!secret) { secret = newId(32); db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('secret', ?)").run(secret); }

  const app = Fastify({ logger, trustProxy: config.trustProxy, bodyLimit: 1024 * 1024 });
  await app.register(fastifyRateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(fastifyStatic, { root: PUBLIC_DIR, prefix: '/', index: ['index.html'], wildcard: false });
  app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (String(reply.getHeader('content-type') || '').startsWith('text/html')) reply.header('Content-Security-Policy', CSP);
    if (config.publicUrl.startsWith('https')) reply.header('Strict-Transport-Security', 'max-age=31536000');
    return payload;
  });
  // Liens courts : /d/<id>#<clé> et /u → page unique
  app.get('/d/:id', (_req, reply) => reply.sendFile('index.html'));

  const RL = (max) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });
  const err = (reply, status, error, extra = {}) => reply.status(status).send({ ok: false, error, ...extra });
  const keyOf = (request) => keyFromText(request.headers['x-transfer-key'] || request.query.c);
  const getT = (id) => (ID.test(String(id)) ? db.prepare('SELECT * FROM transfers WHERE id = ?').get(String(id)) : null);
  const filesOf = (id) => db.prepare('SELECT * FROM files WHERE transfer_id = ? ORDER BY idx').all(id);
  const alive = (t) => t && t.status === 'ready' && t.expires_at > Date.now() && (!t.max_downloads || t.downloads < t.max_downloads);
  const shareUrl = (id, key) => `${config.publicUrl}/d/${id}#${Buffer.from(key).toString('base64url')}`;
  const clampDays = (d) => Math.min(Math.max(1, Math.round(Number(d) || config.defaultDays)), config.maxDays);
  const uploadAllowed = (request) => !config.uploadPassword || safeEqual(request.headers['x-upload-password'] || '', config.uploadPassword);
  const owns = (t, request) => t && safeEqual(sha(request.headers['x-upload-token'] || request.query.u || ''), t.upload_token);
  const deleteTransfer = (id) => { db.prepare('DELETE FROM files WHERE transfer_id = ?').run(id); db.prepare('DELETE FROM transfers WHERE id = ?').run(id); store.remove(id); };
  const openT = (t, key) => ({
    ...t, title: openText(key, t.title), message: openText(key, t.message), sender_email: openText(key, t.sender_email), recipients: openText(key, t.recipients),
    files: filesOf(t.id).map((f) => ({ index: f.idx, name: openText(key, f.name) || `fichier-${f.idx + 1}`, size: f.size })),
  });

  app.get('/health', async () => ({ ok: true }));
  app.get('/api/config', async () => ({
    ok: true, appName: config.appName, maxFileBytes: config.maxFileBytes, maxFiles: config.maxFilesPerTransfer, defaultDays: config.defaultDays, maxDays: config.maxDays,
    needsPassword: !!config.uploadPassword, mail: !!mailer,
  }));

  // ---- Envoi ----
  app.post('/api/transfers', RL(30), async (request, reply) => {
    if (!uploadAllowed(request)) return err(reply, 401, 'Mot de passe d\'envoi incorrect', { code: 'UPLOAD_PASSWORD' });
    const key = keyOf(request);
    if (!key) return err(reply, 400, 'Clé de chiffrement manquante');
    const b = request.body || {};
    const email = String(b.email || '').trim();
    const recipients = String(b.to || '').split(/[,;\s]+/).filter(Boolean);
    if (email && !EMAIL.test(email)) return err(reply, 400, 'E-mail de l\'expéditeur invalide');
    if (recipients.length > 20 || !recipients.every((x) => EMAIL.test(x))) return err(reply, 400, 'E-mail du destinataire invalide (20 maximum)');
    const total = Number(b.totalBytes) || 0;
    if (config.quotaBytes && store.used() + total > config.quotaBytes) return err(reply, 507, 'Espace de stockage du serveur plein, réessayez plus tard');
    const id = newId(9);
    const uploadToken = newId(24);
    db.prepare(`INSERT INTO transfers (id, key_check, title, message, sender_email, recipients, password_hash, expires_at, max_downloads, status, upload_token, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?, ?)`).run(id, keyCheck(key), sealText(key, String(b.title || '').slice(0, 150) || null), sealText(key, String(b.message || '').slice(0, 3000) || null),
      sealText(key, email || null), sealText(key, recipients.join(', ') || null), b.password ? hashPassword(String(b.password).slice(0, 200)) : null,
      Date.now() + clampDays(b.days) * 86400e3, Number(b.maxDownloads) > 0 ? Math.min(100000, Math.round(Number(b.maxDownloads))) : null, sha(uploadToken), sha(request.ip), Date.now());
    return { ok: true, id, uploadToken, maxFileBytes: config.maxFileBytes };
  });

  app.put('/api/transfers/:id/files', { ...RL(1200), bodyLimit: 1024 ** 4 }, async (request, reply) => {
    const t = getT(request.params.id);
    const stream = request.body;
    const drain = () => stream?.resume?.();
    if (!t || t.status !== 'uploading' || !owns(t, request)) { drain(); return err(reply, 404, 'Envoi introuvable ou terminé'); }
    const key = keyOf(request);
    if (!keyMatches(key, t.key_check)) { drain(); return err(reply, 403, 'Clé de chiffrement incorrecte'); }
    if (!stream || typeof stream.pipe !== 'function') return err(reply, 400, 'Envoyez le fichier en application/octet-stream');
    const idx = Number(request.query.idx); const offset = Number(request.query.offset) || 0; const total = Number(request.query.total);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.maxFilesPerTransfer || !Number.isInteger(total) || total < 0 || !Number.isInteger(offset) || offset < 0) { drain(); return err(reply, 400, 'Paramètres invalides'); }
    if (total > config.maxFileBytes) { drain(); return err(reply, 413, `Fichier trop volumineux (maximum ${fmtSize(config.maxFileBytes)})`); }
    const declared = Number(request.headers['content-length']) || 0;
    if (declared > total - offset) { drain(); return err(reply, 413, 'Morceau plus grand que le fichier annoncé'); }
    if (db.prepare('SELECT 1 FROM files WHERE transfer_id = ? AND idx = ?').get(t.id, idx)) { drain(); return err(reply, 409, 'Fichier déjà reçu'); }
    try {
      const r = await store.appendChunk(t.id, idx, stream, { offset, total, key });
      if (r.complete) db.prepare('INSERT INTO files (transfer_id, idx, name, size, created_at) VALUES (?, ?, ?, ?, ?)').run(t.id, idx, sealText(key, cleanName(request.query.name)), total, Date.now());
      return { ok: true, index: idx, received: r.received, complete: r.complete };
    } catch (e) {
      if (e.code === 'OFFSET') return err(reply, 409, e.message, { received: e.received });
      if (e.code === 'TOO_LARGE') return err(reply, 413, e.message);
      request.log.warn({ err: e.message }, 'Envoi interrompu');
      return err(reply, 400, 'Envoi interrompu');
    }
  });

  app.post('/api/transfers/:id/finish', RL(30), async (request, reply) => {
    const t = getT(request.params.id);
    if (!t || t.status !== 'uploading' || !owns(t, request)) return err(reply, 404, 'Envoi introuvable ou terminé');
    const key = keyOf(request);
    if (!keyMatches(key, t.key_check)) return err(reply, 403, 'Clé de chiffrement incorrecte');
    if (!filesOf(t.id).length) return err(reply, 400, 'Aucun fichier reçu');
    store.removeParts(t.id);
    const deleteToken = newId(24);
    db.prepare("UPDATE transfers SET status = 'ready', delete_token = ? WHERE id = ?").run(sha(deleteToken), t.id);
    const o = openT(getT(t.id), key);
    const url = shareUrl(t.id, key);
    let mailed = 0;
    if (mailer && request.body?.notify !== false && o.recipients) {
      try {
        await mailer.sendLink({ to: o.recipients, from: o.sender_email, link: url, title: o.title, message: o.message, files: o.files.map((f) => `${f.name} (${fmtSize(f.size)})`), totalSize: fmtSize(o.files.reduce((n, f) => n + f.size, 0)), expiresAt: o.expires_at });
        mailed = o.recipients.split(', ').length;
      } catch (e) { request.log.warn({ err: e.message }, 'E-mail non envoyé'); }
    }
    return { ok: true, id: t.id, url, deleteToken, expiresAt: o.expires_at, mailed };
  });

  app.delete('/api/transfers/:id', RL(30), async (request, reply) => {
    const t = getT(request.params.id);
    const tok = request.headers['x-delete-token'] || '';
    if (!t) return err(reply, 404, 'Transfert introuvable');
    if (!(t.delete_token && safeEqual(sha(tok), t.delete_token)) && !owns(t, request)) return err(reply, 403, 'Jeton de suppression incorrect');
    deleteTransfer(t.id);
    return { ok: true };
  });

  // ---- Téléchargement ----
  app.get('/api/transfers/:id', RL(120), async (request, reply) => {
    const t = getT(request.params.id);
    if (!alive(t)) return err(reply, 404, 'Ce transfert n\'existe pas ou a expiré', { code: 'NOT_FOUND' });
    const key = keyOf(request);
    if (!keyMatches(key, t.key_check)) return err(reply, 401, 'Lien incomplet : la clé de déchiffrement (après le « # ») manque ou est incorrecte.', { code: 'BAD_KEY' });
    const o = openT(t, key);
    reply.header('cache-control', 'no-store');
    return {
      ok: true, id: t.id, title: o.title, message: o.message, sender: o.sender_email, files: o.files, createdAt: t.created_at, expiresAt: t.expires_at,
      downloadsLeft: t.max_downloads ? t.max_downloads - t.downloads : null, protected: !!t.password_hash, token: t.password_hash ? null : signKey(secret, t.id),
    };
  });
  app.post('/api/transfers/:id/unlock', RL(10), async (request, reply) => {
    const t = getT(request.params.id);
    if (!alive(t)) return err(reply, 404, 'Ce transfert n\'existe pas ou a expiré');
    if (!checkPassword(request.body?.password, t.password_hash)) return err(reply, 403, 'Mot de passe incorrect');
    return { ok: true, token: signKey(secret, t.id) };
  });
  app.get('/api/transfers/:id/files/:index', RL(300), async (request, reply) => {
    const t = getT(request.params.id);
    if (!alive(t)) return err(reply, 404, 'Ce transfert n\'existe pas ou a expiré');
    if (!verifyKey(secret, t.id, request.query.t)) return err(reply, 403, 'Lien de téléchargement expiré : rouvrez la page');
    const key = keyOf(request);
    if (!keyMatches(key, t.key_check)) return err(reply, 401, 'Clé de déchiffrement incorrecte');
    const f = db.prepare('SELECT * FROM files WHERE transfer_id = ? AND idx = ?').get(t.id, Number(request.params.index));
    const p = f ? store.file(t.id, f.idx) : null;
    if (!f || !fs.existsSync(p)) return err(reply, 404, 'Fichier introuvable');
    const name = openText(key, f.name) || `fichier-${f.idx + 1}`;
    reply.header('content-type', 'application/octet-stream');
    reply.header('content-disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    reply.header('accept-ranges', 'bytes');
    reply.header('cache-control', 'private, no-store');
    const size = f.size;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range || ''));
    let start = 0; let end = size - 1;
    if (m && (m[1] || m[2]) && size > 0) {
      if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), size - 1); } else start = Math.max(0, size - Number(m[2]));
      if (start > end || start >= size) { reply.header('content-range', `bytes */${size}`); return reply.status(416).send(); }
      reply.status(206).header('content-range', `bytes ${start}-${end}/${size}`);
    }
    reply.header('content-length', String(Math.max(0, end - start + 1)));
    if (start === 0) {
      db.prepare('UPDATE files SET downloads = downloads + 1 WHERE transfer_id = ? AND idx = ?').run(t.id, f.idx);
      if (f.idx === filesOf(t.id)[0]?.idx) db.prepare('UPDATE transfers SET downloads = downloads + 1 WHERE id = ?').run(t.id);
    }
    if (size === 0) return reply.send(Buffer.alloc(0));
    return reply.send(Readable.from(decryptRange(p, key, filePrefix(key, t.id, f.idx), size, start, end)));
  });

  /** Supprime les transferts expirés, épuisés ou abandonnés. */
  function purge() {
    const now = Date.now();
    const dead = db.prepare("SELECT id FROM transfers WHERE expires_at <= ? OR (max_downloads IS NOT NULL AND downloads >= max_downloads) OR (status = 'uploading' AND created_at < ?)").all(now, now - 24 * 3600e3);
    for (const { id } of dead) deleteTransfer(id);
    return dead.length;
  }
  const timer = setInterval(purge, 3600e3); timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); db.close(); });
  app.decorate('purge', purge);
  app.decorate('db', db);
  return app;
}
