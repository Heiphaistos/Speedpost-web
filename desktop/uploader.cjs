/**
 * Moteur d'envoi SpeedPost (Node / Electron) : même protocole que la page web.
 * La clé de chiffrement est générée ici et ne part vers le serveur que dans les en-têtes des requêtes d'envoi ;
 * elle n'est enregistrée que dans le lien final (/d/<id>#<clé>).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');

const CHUNK = 48 * 1024 * 1024; // multiple de 1 Mio (blocs chiffrés), < 100 Mo (limite Cloudflare)

async function call(server, method, url, { body, headers = {} } = {}) {
  const res = await fetch(`${server}${url}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status, code: data.code, received: data.received });
  return data;
}

async function getConfig(server) { return call(normalize(server), 'GET', '/api/config'); }
const normalize = (s) => String(s || '').trim().replace(/\/+$/, '');

/**
 * @param {object} o
 * @param {string} o.server  URL du serveur SpeedPost
 * @param {string[]} o.files chemins des fichiers
 * @param {object} [o.options] { title, message, days, password, maxDownloads, email, to, uploadPassword }
 * @param {(p: { index:number, name:string, sent:number, size:number, totalSent:number, total:number }) => void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 */
async function sendFiles({ server, files, options = {}, onProgress = () => {}, signal }) {
  server = normalize(server);
  const list = files.map((p) => ({ path: p, name: path.basename(p), size: fs.statSync(p).size }));
  const total = list.reduce((n, f) => n + f.size, 0);
  const key = crypto.randomBytes(32).toString('base64url');
  const start = await call(server, 'POST', '/api/transfers', {
    headers: { 'x-transfer-key': key, 'x-upload-password': options.uploadPassword || '' },
    body: { title: options.title || '', message: options.message || '', days: options.days, password: options.password || '', maxDownloads: options.maxDownloads || null, email: options.email || '', to: options.to || '', totalBytes: total },
  });
  const headers = { 'x-transfer-key': key, 'x-upload-token': start.uploadToken };
  let before = 0;
  for (const [i, f] of list.entries()) {
    let offset = 0; let tries = 0;
    for (;;) {
      if (signal?.aborted) throw new Error('Envoi annulé');
      const end = Math.min(offset + CHUNK, f.size);
      let sent = 0;
      const counter = new Transform({ transform(chunk, _e, cb) { sent += chunk.length; onProgress({ index: i, name: f.name, sent: offset + sent, size: f.size, totalSent: before + offset + sent, total }); cb(null, chunk); } });
      const body = f.size ? Readable.toWeb(fs.createReadStream(f.path, { start: offset, end: end - 1 }).pipe(counter)) : new Uint8Array(0);
      try {
        const res = await fetch(`${server}/api/transfers/${start.id}/files?idx=${i}&offset=${offset}&total=${f.size}&name=${encodeURIComponent(f.name)}`, {
          method: 'PUT', headers: { ...headers, 'content-type': 'application/octet-stream', 'content-length': String(end - offset) }, body, duplex: 'half', signal,
        });
        const d = await res.json().catch(() => ({}));
        if (res.status === 409 && typeof d.received === 'number') { offset = d.received; continue; }
        if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error || `Erreur ${res.status}`), { status: res.status });
        offset = d.received; tries = 0;
        if (d.complete) break;
      } catch (err) {
        if (signal?.aborted) throw new Error('Envoi annulé');
        const retry = !err.status || err.status >= 500;
        if (retry && ++tries <= 6) { await new Promise((r) => setTimeout(r, 1000 * 2 ** tries)); continue; }
        throw new Error(`${f.name} : ${err.message}`);
      }
    }
    before += f.size;
    onProgress({ index: i, name: f.name, sent: f.size, size: f.size, totalSent: before, total });
  }
  const done = await call(server, 'POST', `/api/transfers/${start.id}/finish`, { headers, body: { notify: true } });
  return { id: done.id, url: done.url, deleteToken: done.deleteToken, expiresAt: done.expiresAt, mailed: done.mailed, count: list.length, size: total, title: options.title || (list.length === 1 ? list[0].name : `${list.length} fichiers`), createdAt: Date.now() };
}

async function deleteTransfer(server, id, deleteToken) {
  return call(normalize(server), 'DELETE', `/api/transfers/${encodeURIComponent(id)}`, { headers: { 'x-delete-token': deleteToken } });
}

module.exports = { sendFiles, deleteTransfer, getConfig, CHUNK };
