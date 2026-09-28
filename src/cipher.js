/**
 * Chiffrement des fichiers au repos : AES-256-GCM par blocs de 1 Mio.
 *
 * - Une clé aléatoire de 256 bits par transfert. Elle n'est JAMAIS enregistrée sur le serveur :
 *   elle ne vit que dans le lien de partage (après le « # »), le serveur la reçoit le temps d'un envoi ou d'un téléchargement.
 * - Chaque bloc est authentifié (tag de 16 octets) ; nonce = préfixe propre au fichier (8 octets) + numéro de bloc ;
 *   les données associées (AAD) portent le numéro de bloc et un drapeau « dernier bloc » : un fichier tronqué,
 *   réordonné ou modifié est détecté.
 * - Le découpage en blocs permet la reprise des envois et les téléchargements partiels (Range) sans tout déchiffrer.
 * Format identique au module « transfer » de HeiphaisBot.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Transform } from 'node:stream';

export const BLOCK = 1024 * 1024;
export const TAG = 16;
export const CBLOCK = BLOCK + TAG;

export const newKey = () => crypto.randomBytes(32);
export const keyToText = (key) => Buffer.from(key).toString('base64url');
/** Clé texte (43 caractères base64url) → Buffer, ou null si invalide. */
export function keyFromText(text) {
  const s = String(text || '').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(s)) return null;
  const k = Buffer.from(s, 'base64url');
  return k.length === 32 ? k : null;
}
/** Empreinte de vérification (ne révèle pas la clé) : distingue « mauvaise clé » de « fichier corrompu ». */
export const keyCheck = (key) => crypto.createHmac('sha256', key).update('speedpost:check').digest('hex').slice(0, 32);
export function keyMatches(key, check) {
  if (!key || !check) return false;
  const a = Buffer.from(keyCheck(key)); const b = Buffer.from(String(check));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Préfixe de nonce propre à un fichier d'un transfert. */
export const filePrefix = (key, transferId, index) => crypto.createHmac('sha256', key).update(`file:${transferId}:${index}`).digest().subarray(0, 8);

function nonce(prefix, counter) { const n = Buffer.alloc(12); prefix.copy(n, 0, 0, 8); n.writeUInt32BE(counter >>> 0, 8); return n; }
function aad(counter, final) { const a = Buffer.alloc(5); a.writeUInt32BE(counter >>> 0, 0); a[4] = final ? 1 : 0; return a; }

export function encryptBlock(key, prefix, counter, final, plain) {
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce(prefix, counter));
  c.setAAD(aad(counter, final));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([c.getAuthTag(), ct]);
}
export function decryptBlock(key, prefix, counter, final, data) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, nonce(prefix, counter));
  d.setAAD(aad(counter, final));
  d.setAuthTag(data.subarray(0, TAG));
  return Buffer.concat([d.update(data.subarray(TAG)), d.final()]);
}

/** Nombre de blocs et taille chiffrée d'un fichier de `size` octets en clair. */
export const blockCount = (size) => Math.max(1, Math.ceil(size / BLOCK));
export const cipherSize = (size) => size + blockCount(size) * TAG;

/**
 * Flux de chiffrement.
 * @param {{ startCounter?: number, total?: number|null, onPlain?: (bytes:number) => void }} opts
 *   total connu (envoi par morceaux) : le dernier bloc est repéré par son numéro ;
 *   total inconnu (flux unique) : le dernier bloc est retenu jusqu'à la fin du flux.
 */
export function encryptor(key, prefix, { startCounter = 0, total = null, onPlain } = {}) {
  let counter = startCounter;
  let pending = Buffer.alloc(0);
  let emitted = false;
  const last = total === null ? null : blockCount(total) - 1;
  const emit = (stream, buf, final) => { stream.push(encryptBlock(key, prefix, counter, final, buf)); counter++; emitted = true; };
  return new Transform({
    transform(chunk, _enc, cb) {
      try {
        onPlain?.(chunk.length);
        pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
        if (total === null) {
          while (pending.length > BLOCK) { emit(this, pending.subarray(0, BLOCK), false); pending = pending.subarray(BLOCK); }
        } else {
          while (counter <= last) {
            const need = counter === last ? total - counter * BLOCK : BLOCK;
            if (pending.length < need) break;
            emit(this, pending.subarray(0, need), counter === last);
            pending = pending.subarray(need);
          }
          if (counter > last && pending.length) return cb(Object.assign(new Error('Données au-delà de la taille annoncée'), { code: 'TOO_LARGE' }));
        }
        cb();
      } catch (err) { cb(err); }
    },
    flush(cb) {
      try {
        if (total === null) { if (pending.length || !emitted) emit(this, pending, true); }
        else if (counter === last && total - counter * BLOCK === 0 && pending.length === 0) emit(this, pending, true); // fichier vide
        // total connu et bloc incomplet : conservé pour la reprise (non écrit)
        cb();
      } catch (err) { cb(err); }
    },
  });
}

/** Lit et déchiffre les octets [start, end] (inclus) d'un fichier chiffré. */
export async function* decryptRange(path, key, prefix, size, start = 0, end = size - 1) {
  const n = blockCount(size);
  if (size === 0) { decryptBlock(key, prefix, 0, true, fs.readFileSync(path)); return; }
  const fh = await fs.promises.open(path, 'r');
  try {
    const first = Math.floor(start / BLOCK); const lastB = Math.min(Math.floor(end / BLOCK), n - 1);
    for (let b = first; b <= lastB; b++) {
      const plainLen = b === n - 1 ? size - b * BLOCK : BLOCK;
      const buf = Buffer.alloc(plainLen + TAG);
      const { bytesRead } = await fh.read(buf, 0, buf.length, b * CBLOCK);
      if (bytesRead !== buf.length) throw new Error('Fichier chiffré tronqué');
      const plain = decryptBlock(key, prefix, b, b === n - 1, buf);
      yield plain.subarray(b === first ? start - b * BLOCK : 0, b === lastB ? end - b * BLOCK + 1 : plain.length);
    }
  } finally { await fh.close(); }
}

/** Texte court chiffré (nom de fichier, titre, message) → base64url(nonce | tag | chiffré). */
export function sealText(key, text) {
  if (text === null || text === undefined || text === '') return null;
  const n = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, n);
  c.setAAD(Buffer.from('speedpost:meta'));
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([n, c.getAuthTag(), ct]).toString('base64url');
}
export function openText(key, sealed) {
  if (!sealed) return null;
  try {
    const b = Buffer.from(String(sealed), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAAD(Buffer.from('speedpost:meta'));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}
