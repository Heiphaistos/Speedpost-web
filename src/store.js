/**
 * Base SQLite + fichiers chiffrés sur le disque.
 * Arborescence : <dataDir>/files/<transferId>/<index> — aucun nom fourni par l'utilisateur n'arrive sur le disque.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import Database from 'better-sqlite3';
import { BLOCK, CBLOCK, encryptor, filePrefix, cipherSize } from './cipher.js';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS transfers (id TEXT PRIMARY KEY, key_check TEXT NOT NULL, title TEXT, message TEXT, sender_email TEXT, recipients TEXT,
      password_hash TEXT, expires_at INTEGER NOT NULL, max_downloads INTEGER, downloads INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'uploading',
      upload_token TEXT NOT NULL, delete_token TEXT, ip TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS files (transfer_id TEXT NOT NULL, idx INTEGER NOT NULL, name TEXT, size INTEGER NOT NULL, downloads INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (transfer_id, idx));
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
  `);
  return db;
}

export const newId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? '')); const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Nom affichable et sûr (pas de chemin, pas de caractères de contrôle). */
export function cleanName(name) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '_').replace(/^\.+/, '').trim();
  return (base || 'fichier').slice(0, 200);
}

export function fmtSize(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let x = v / 1024; let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 })} ${units[i]}`;
}

// ---- Mots de passe (scrypt) et jetons de téléchargement signés ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return true;
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(String(pw || ''), Buffer.from(salt, 'hex'), 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
export function signKey(secret, id, ttlMs = 6 * 3600e3) {
  const exp = Date.now() + ttlMs;
  return `${exp}.${crypto.createHmac('sha256', secret).update(`${id}.${exp}`).digest('base64url').slice(0, 32)}`;
}
export function verifyKey(secret, id, key) {
  const [exp, sig] = String(key || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, crypto.createHmac('sha256', secret).update(`${id}.${exp}`).digest('base64url').slice(0, 32));
}

export class Store {
  constructor(dataDir) { this.root = path.join(dataDir, 'files'); fs.mkdirSync(this.root, { recursive: true }); }
  dir(id) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(id))) throw new Error('Identifiant invalide');
    return path.join(this.root, id);
  }
  file(id, idx) { return path.join(this.dir(id), String(Number(idx))); }
  remove(id) { try { fs.rmSync(this.dir(id), { recursive: true, force: true }); } catch { /* absent */ } }
  removeParts(id) {
    try { for (const f of fs.readdirSync(this.dir(id))) if (f.endsWith('.part')) fs.rmSync(path.join(this.dir(id), f), { force: true }); } catch { /* absent */ }
  }

  /**
   * Ajoute un morceau chiffré. `offset` (en clair) doit correspondre à ce qui est déjà reçu (blocs complets).
   * Renvoie { received, complete }.
   */
  async appendChunk(id, idx, readable, { offset, total, key }) {
    fs.mkdirSync(this.dir(id), { recursive: true });
    const dest = this.file(id, idx);
    const tmp = `${dest}.part`;
    let blocks = 0;
    if (fs.existsSync(tmp)) {
      if (offset === 0) fs.rmSync(tmp, { force: true });
      else { blocks = Math.floor(fs.statSync(tmp).size / CBLOCK); fs.truncateSync(tmp, blocks * CBLOCK); }
    }
    const received = Math.min(blocks * BLOCK, total);
    if (offset !== received) throw Object.assign(new Error('Position de reprise incorrecte'), { code: 'OFFSET', received });
    await pipeline(readable, limiter(total - offset), encryptor(key, filePrefix(key, id, idx), { startCounter: blocks, total }), fs.createWriteStream(tmp, { flags: 'a' }));
    const csize = fs.statSync(tmp).size;
    if (csize >= cipherSize(total)) { fs.renameSync(tmp, dest); return { received: total, complete: true }; }
    return { received: Math.min(Math.floor(csize / CBLOCK) * BLOCK, total), complete: false };
  }

  /** Espace disque utilisé par tous les transferts. */
  used() {
    let n = 0;
    for (const d of fs.readdirSync(this.root)) {
      try { for (const f of fs.readdirSync(path.join(this.root, d))) n += fs.statSync(path.join(this.root, d, f)).size; } catch { /* supprimé entre-temps */ }
    }
    return n;
  }
}

function limiter(maxBytes) {
  let total = 0;
  return new Transform({
    transform(chunk, _e, cb) {
      total += chunk.length;
      if (total > maxBytes) return cb(Object.assign(new Error('Données au-delà de la taille annoncée'), { code: 'TOO_LARGE' }));
      cb(null, chunk);
    },
  });
}
