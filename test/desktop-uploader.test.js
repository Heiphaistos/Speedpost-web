import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

const { sendFiles, deleteTransfer } = createRequire(import.meta.url)('../desktop/uploader.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speedpost-desk-'));
let app; let server;

before(async () => {
  app = await buildApp(loadConfig({ DATA_DIR: path.join(tmp, 'data'), UPLOAD_PASSWORD: 'pw' }), { mailer: null });
  await app.listen({ host: '127.0.0.1', port: 0 });
  server = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('application Windows : envoi de vrais fichiers (flux, morceaux, progression) puis téléchargement', async () => {
  const a = path.join(tmp, 'gros fichier.bin'); const b = path.join(tmp, 'vide.txt');
  const content = Buffer.alloc(3 * 1024 * 1024 + 7); for (let i = 0; i < content.length; i++) content[i] = (i * 7) % 256;
  fs.writeFileSync(a, content); fs.writeFileSync(b, '');
  let last = null;
  await assert.rejects(sendFiles({ server, files: [a], options: {} }), /Mot de passe d'envoi/);
  const r = await sendFiles({ server, files: [a, b], options: { uploadPassword: 'pw', title: 'Test' }, onProgress: (p) => { last = p; } });
  assert.equal(last.totalSent, content.length);
  assert.equal(r.count, 2);
  const id = r.id; const key = new URL(r.url).hash.slice(1);
  assert.equal(new URL(r.url).pathname, `/d/${id}`);
  const info = await (await fetch(`${server}/api/transfers/${id}`, { headers: { 'x-transfer-key': key } })).json();
  assert.equal(info.title, 'Test');
  assert.deepEqual(info.files.map((f) => f.name), ['gros fichier.bin', 'vide.txt']);
  const dl = Buffer.from(await (await fetch(`${server}/api/transfers/${id}/files/0?t=${encodeURIComponent(info.token)}&c=${key}`)).arrayBuffer());
  assert.ok(dl.equals(content));
  await deleteTransfer(server, r.id, r.deleteToken);
  assert.equal((await fetch(`${server}/api/transfers/${id}`, { headers: { 'x-transfer-key': key } })).status, 404);
});
