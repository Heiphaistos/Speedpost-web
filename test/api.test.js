import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speedpost-'));
const KEY = Buffer.alloc(32, 5).toString('base64url');
const B = 1024 * 1024;
let app; const mails = [];

before(async () => {
  const config = loadConfig({ DATA_DIR: tmp, PUBLIC_URL: 'https://speedpost.exemple.fr', MAX_FILE_MB: '5' });
  app = await buildApp(config, { mailer: { sendLink: async (m) => { mails.push(m); } } });
});
after(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const req = (method, url, { body, headers = {} } = {}) => app.inject({ method, url, headers: { 'x-transfer-key': KEY, ...(body && !Buffer.isBuffer(body) ? { 'content-type': 'application/json' } : {}), ...(Buffer.isBuffer(body) ? { 'content-type': 'application/octet-stream' } : {}), ...headers }, payload: Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined });
const json = (r) => JSON.parse(r.body);

async function upload(files, meta = {}) {
  const start = json(await req('POST', '/api/transfers', { body: meta }));
  const h = { 'x-upload-token': start.uploadToken };
  for (const [i, [name, buf]] of files.entries()) {
    for (let off = 0; off < buf.length || off === 0; off += B) {
      const r = json(await req('PUT', `/api/transfers/${start.id}/files?idx=${i}&offset=${off}&total=${buf.length}&name=${encodeURIComponent(name)}`, { body: buf.subarray(off, off + B), headers: h }));
      assert.equal(r.ok, true, JSON.stringify(r));
      if (r.complete) break;
    }
  }
  return { ...json(await req('POST', `/api/transfers/${start.id}/finish`, { body: { notify: true }, headers: h })), uploadToken: start.uploadToken };
}

test('envoi sans compte ni e-mail → lien court avec la clé après #', async () => {
  const content = Buffer.alloc(2 * B + 123, 3);
  const done = await upload([['vidéo.mp4', content], ['notes.txt', Buffer.from('salut')]]);
  assert.match(done.url, new RegExp(`^https://speedpost\\.exemple\\.fr/d/${done.id}#${KEY}$`));
  assert.equal(mails.length, 0, 'aucun e-mail sans destinataire');
  const info = json(await req('GET', `/api/transfers/${done.id}`));
  assert.deepEqual(info.files.map((f) => [f.name, f.size]), [['vidéo.mp4', content.length], ['notes.txt', 5]]);
  const dl = await req('GET', `/api/transfers/${done.id}/files/0?t=${encodeURIComponent(info.token)}&c=${KEY}`);
  assert.ok(dl.rawPayload.equals(content));
  assert.match(dl.headers['content-disposition'], /filename\*=UTF-8''vid%C3%A9o\.mp4/);
  const part = await req('GET', `/api/transfers/${done.id}/files/0?t=${encodeURIComponent(info.token)}&c=${KEY}`, { headers: { range: `bytes=${B - 1}-${B}` } });
  assert.equal(part.statusCode, 206);
  assert.ok(part.rawPayload.equals(content.subarray(B - 1, B + 1)));
  // chiffré sur le disque, clé jamais enregistrée
  const disk = fs.readFileSync(path.join(tmp, 'files', done.id, '1'));
  assert.ok(!disk.includes(Buffer.from('salut')));
  assert.ok(!fs.readFileSync(path.join(tmp, 'speedpost.db')).includes(Buffer.from(KEY)));
  // sans la bonne clé : rien
  assert.equal((await req('GET', `/api/transfers/${done.id}`, { headers: { 'x-transfer-key': Buffer.alloc(32, 1).toString('base64url') } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: `/api/transfers/${done.id}` })).statusCode, 401);
  // suppression par l'expéditeur
  assert.equal((await req('DELETE', `/api/transfers/${done.id}`, { headers: { 'x-delete-token': 'faux' } })).statusCode, 403);
  assert.equal((await req('DELETE', `/api/transfers/${done.id}`, { headers: { 'x-delete-token': done.deleteToken } })).statusCode, 200);
  assert.ok(!fs.existsSync(path.join(tmp, 'files', done.id)));
});

test('e-mail facultatif : envoyé seulement si des destinataires sont indiqués', async () => {
  const done = await upload([['a.pdf', Buffer.from('%PDF')]], { email: 'moi@exemple.fr', to: 'toi@exemple.fr', title: 'Contrat', message: 'Voici' });
  assert.equal(done.mailed, 1);
  assert.equal(mails[0].to, 'toi@exemple.fr');
  assert.equal(mails[0].link, done.url);
  assert.equal((await req('POST', '/api/transfers', { body: { to: 'pas-un-mail' } })).statusCode, 400);
});

test('mot de passe de téléchargement, limite de taille et purge', async () => {
  const done = await upload([['s.bin', Buffer.from('secret')]], { password: 'pw', maxDownloads: 1 });
  const info = json(await req('GET', `/api/transfers/${done.id}`));
  assert.equal(info.token, null);
  assert.equal((await req('POST', `/api/transfers/${done.id}/unlock`, { body: { password: 'non' } })).statusCode, 403);
  const { token } = json(await req('POST', `/api/transfers/${done.id}/unlock`, { body: { password: 'pw' } }));
  assert.equal((await req('GET', `/api/transfers/${done.id}/files/0?t=${encodeURIComponent(token)}&c=${KEY}`)).body, 'secret');
  assert.equal((await req('GET', `/api/transfers/${done.id}`)).statusCode, 404, 'un seul téléchargement autorisé');
  assert.equal(app.purge() >= 1, true);
  const start = json(await req('POST', '/api/transfers', { body: {} }));
  const big = await req('PUT', `/api/transfers/${start.id}/files?idx=0&offset=0&total=${6 * B}&name=x`, { body: Buffer.alloc(10), headers: { 'x-upload-token': start.uploadToken } });
  assert.equal(big.statusCode, 413);
  assert.equal((await req('PUT', `/api/transfers/${start.id}/files?idx=0&offset=0&total=10&name=x`, { body: Buffer.alloc(10), headers: { 'x-upload-token': 'faux' } })).statusCode, 404);
});

test('serveur privé : mot de passe d\'envoi requis', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speedpost-priv-'));
  const priv = await buildApp(loadConfig({ DATA_DIR: dir, UPLOAD_PASSWORD: 'maison' }), { mailer: null });
  const post = (pw) => priv.inject({ method: 'POST', url: '/api/transfers', headers: { 'content-type': 'application/json', 'x-transfer-key': KEY, ...(pw ? { 'x-upload-password': pw } : {}) }, payload: '{}' });
  assert.equal((await post()).statusCode, 401);
  assert.equal((await post('maison')).statusCode, 200);
  assert.equal(JSON.parse((await priv.inject({ method: 'GET', url: '/api/config' })).body).needsPassword, true);
  const page = await priv.inject({ method: 'GET', url: '/d/abcdefghij' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /app\.js/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  // site vitrine + application
  assert.match((await priv.inject({ method: 'GET', url: '/' })).body, /Vos fichiers, <span class="grad">/);
  assert.match((await priv.inject({ method: 'GET', url: '/app' })).body, /app\.js/);
  for (const f of ['fonctionnalites', 'securite', 'telecharger', 'faq', 'confidentialite']) assert.equal((await priv.inject({ method: 'GET', url: `/${f}.html` })).statusCode, 200, f);
  // applications déposées sur le serveur
  fs.mkdirSync(path.join(dir, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'downloads', 'SpeedPost-1.0.0-x64-nsis.exe'), 'MZ');
  fs.writeFileSync(path.join(dir, 'downloads', 'notes.txt'), 'ignoré');
  const dl = JSON.parse((await priv.inject({ method: 'GET', url: '/api/downloads' })).body);
  assert.deepEqual(dl.files.map((f) => [f.name, f.platform]), [['SpeedPost-1.0.0-x64-nsis.exe', 'windows']]);
  assert.equal((await priv.inject({ method: 'GET', url: '/downloads/SpeedPost-1.0.0-x64-nsis.exe' })).body, 'MZ');
  assert.equal((await priv.inject({ method: 'GET', url: '/downloads/..%2Fspeedpost.db' })).statusCode, 404);
  await priv.close(); fs.rmSync(dir, { recursive: true, force: true });
});
