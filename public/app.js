// SpeedPost — interface web (envoi, téléchargement, mes envois).
// Les données venant du serveur sont toujours insérées en texte, jamais en HTML.
const $app = document.getElementById('app');
const CHUNK = 48 * 1024 * 1024; // < 100 Mo par requête (limite Cloudflare), multiple de 1 Mio (blocs chiffrés)
const HISTORY = 'speedpost.sent';

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const fmtSize = (n) => {
  const v = Number(n) || 0; if (v < 1024) return `${v} o`;
  const u = ['Ko', 'Mo', 'Go', 'To']; let x = v / 1024; let i = 0;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 })} ${u[i]}`;
};
const fmtDate = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const iconFor = (name) => {
  const ext = String(name).split('.').pop().toLowerCase();
  if (/^(jpe?g|png|gif|webp|heic|bmp|svg)$/.test(ext)) return '🖼️';
  if (/^(mp4|mkv|mov|avi|webm)$/.test(ext)) return '🎬';
  if (/^(mp3|flac|wav|ogg|m4a)$/.test(ext)) return '🎵';
  if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return '🗜️';
  if (/^(exe|msi|apk|dmg|appimage)$/.test(ext)) return '⚙️';
  if (/^(pdf)$/.test(ext)) return '📕';
  if (/^(docx?|odt|txt|md|rtf)$/.test(ext)) return '📄';
  if (/^(xlsx?|ods|csv)$/.test(ext)) return '📊';
  return '📦';
};
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const newKey = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
};

async function api(method, url, { body, headers = {} } = {}) {
  const res = await fetch(url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status, code: data.code });
  return data;
}

function page(title, subtitle, ...content) {
  document.title = `${title} · SpeedPost`;
  $app.replaceChildren(el('div', { class: 'head' }, el('h1', {}, title), subtitle ? el('div', { class: 'sub' }, subtitle) : null), el('div', { class: 'body' }, ...content));
}
function fail(title, message) {
  page(title, null, el('div', { class: 'hero' }, '🔗'), el('p', { class: 'err center' }, message), el('a', { class: 'btn ghost', href: '/' }, '📤 Envoyer des fichiers'));
}

// ------------------------------------------------------------------ Envoi
function putChunk(url, blob, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries({ 'content-type': 'application/octet-stream', ...headers })) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      let d = {}; try { d = JSON.parse(xhr.responseText); } catch { /* vide */ }
      if (xhr.status < 300 && d.ok !== false) resolve(d); else reject(Object.assign(new Error(d.error || `Erreur ${xhr.status}`), { status: xhr.status, received: d.received }));
    };
    xhr.onerror = () => reject(Object.assign(new Error('Connexion interrompue'), { status: 0 }));
    xhr.send(blob);
  });
}
async function putFile(id, idx, file, headers, onProgress) {
  let offset = 0; let tries = 0;
  for (;;) {
    const blob = file.slice(offset, Math.min(offset + CHUNK, file.size));
    const url = `/api/transfers/${id}/files?idx=${idx}&offset=${offset}&total=${file.size}&name=${encodeURIComponent(file.name)}`;
    try {
      const r = await putChunk(url, blob, headers, (loaded) => onProgress(file.size ? (offset + loaded) / file.size : 1));
      offset = r.received; tries = 0;
      if (r.complete) return;
    } catch (err) {
      if (err.status === 409 && typeof err.received === 'number') { offset = err.received; continue; }
      if ((err.status === 0 || err.status >= 500) && ++tries <= 6) { await new Promise((res) => setTimeout(res, 1000 * 2 ** tries)); continue; }
      throw err;
    }
  }
}

async function uploadPage() {
  let cfg;
  try { cfg = await api('GET', '/api/config'); } catch (err) { fail('Serveur indisponible', err.message); return; }
  const files = [];
  const list = el('ul', { class: 'files' });
  const totalLine = el('div', { class: 'total hidden' });
  const picker = el('input', { type: 'file', multiple: true, class: 'hidden' });
  const drop = el('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Choisir des fichiers', onclick: () => picker.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } } },
    el('div', { class: 'big' }, '📤'), el('b', {}, 'Glissez vos fichiers ici'), el('span', { class: 'muted' }, `ou cliquez pour les choisir · jusqu'à ${fmtSize(cfg.maxFileBytes)} par fichier`));
  const errBox = el('p', { class: 'err hidden' });
  const showError = (m) => { errBox.textContent = m; errBox.classList.remove('hidden'); };
  const send = el('button', { type: 'submit', disabled: true }, '🚀 Obtenir le lien');
  const refresh = () => {
    list.replaceChildren(...files.map((f, i) => {
      f.row = el('li', { class: 'file' }, el('span', { class: 'ic' }, iconFor(f.file.name)), el('span', { class: 'n', title: f.file.name }, f.file.name), el('span', { class: 's' }, fmtSize(f.file.size)),
        el('button', { type: 'button', class: 'x', title: 'Retirer', 'aria-label': `Retirer ${f.file.name}`, onclick: () => { files.splice(i, 1); refresh(); } }, '✕'), el('div', { class: 'bar' }, el('i')));
      return f.row;
    }));
    const total = files.reduce((n, f) => n + f.file.size, 0);
    totalLine.replaceChildren(el('span', {}, `${files.length} fichier${files.length > 1 ? 's' : ''}`), el('span', {}, fmtSize(total)));
    totalLine.classList.toggle('hidden', !files.length);
    send.disabled = !files.length;
  };
  const add = (fl) => {
    errBox.classList.add('hidden');
    for (const file of fl) {
      if (file.size > cfg.maxFileBytes) { showError(`« ${file.name} » dépasse ${fmtSize(cfg.maxFileBytes)}`); continue; }
      if (files.length >= cfg.maxFiles) { showError(`${cfg.maxFiles} fichiers maximum`); break; }
      files.push({ file });
    }
    refresh();
  };
  picker.addEventListener('change', () => { add(picker.files); picker.value = ''; });
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => add(e.dataTransfer.files));
  // Coller un fichier (Ctrl+V)
  document.onpaste = (e) => { if (e.clipboardData?.files?.length) add(e.clipboardData.files); };

  const title = el('input', { type: 'text', maxlength: '150', placeholder: 'Facultatif' });
  const message = el('textarea', { maxlength: '3000', placeholder: 'Facultatif — affiché sur la page de téléchargement' });
  const days = el('select', {}, ...[1, 2, 3, 7, 14, 30, 60, 90, 180, 365].filter((d) => d <= cfg.maxDays).map((d) => el('option', { value: String(d), selected: d === cfg.defaultDays }, d === 1 ? '1 jour' : `${d} jours`)));
  const password = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Facultatif' });
  const maxDl = el('input', { type: 'number', min: '1', max: '100000', placeholder: 'Illimité' });
  const email = el('input', { type: 'email', placeholder: 'vous@exemple.fr', value: store.get('speedpost.email', '') });
  const to = el('input', { type: 'text', placeholder: 'destinataire@exemple.fr, autre@exemple.fr' });
  const uploadPw = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe d\'envoi', value: store.get('speedpost.uploadpw', '') });

  const form = el('form', { class: 'body', onsubmit: async (e) => {
    e.preventDefault(); errBox.classList.add('hidden');
    if (!files.length) return;
    const lock = (on) => { send.disabled = on; form.querySelectorAll('input, textarea, select, .x, summary').forEach((x) => { x.disabled = on; x.style.pointerEvents = on ? 'none' : ''; }); };
    lock(true); send.textContent = '⏳ Envoi en cours…';
    const key = newKey();
    try {
      if (email.value) store.set('speedpost.email', email.value.trim());
      if (cfg.needsPassword) store.set('speedpost.uploadpw', uploadPw.value);
      const start = await api('POST', '/api/transfers', { headers: { 'x-transfer-key': key, 'x-upload-password': uploadPw.value }, body: { title: title.value.trim(), message: message.value.trim(), days: Number(days.value), password: password.value, maxDownloads: Number(maxDl.value) || null, email: email.value.trim(), to: to.value.trim(), totalBytes: files.reduce((n, f) => n + f.file.size, 0) } });
      const headers = { 'x-transfer-key': key, 'x-upload-token': start.uploadToken };
      for (const [i, f] of files.entries()) {
        const bar = f.row.querySelector('.bar i');
        try { await putFile(start.id, i, f.file, headers, (p) => { bar.style.width = `${Math.round(p * 100)}%`; }); f.row.classList.add('done'); bar.style.width = '100%'; } catch (ex) { f.row.classList.add('fail'); throw new Error(`${f.file.name} : ${ex.message}`); }
      }
      const done = await api('POST', `/api/transfers/${start.id}/finish`, { headers, body: { notify: true } });
      const entry = { id: done.id, url: done.url, deleteToken: done.deleteToken, expiresAt: done.expiresAt, createdAt: Date.now(), title: title.value.trim() || (files.length === 1 ? files[0].file.name : `${files.length} fichiers`), size: files.reduce((n, f) => n + f.file.size, 0), count: files.length };
      store.set(HISTORY, [entry, ...store.get(HISTORY, [])].slice(0, 100));
      donePage(entry, { mailed: done.mailed, to: to.value.trim(), message: message.value.trim(), from: email.value.trim() });
    } catch (ex) {
      showError(ex.code === 'UPLOAD_PASSWORD' ? 'Mot de passe d\'envoi incorrect' : ex.message);
      lock(false); send.textContent = '🚀 Réessayer';
    }
  } },
  drop, picker, list, totalLine,
  cfg.needsPassword ? el('label', {}, 'Mot de passe d\'envoi', uploadPw, el('span', { class: 'hint' }, 'Ce serveur est privé : demandez ce mot de passe à son administrateur.')) : null,
  el('details', {}, el('summary', {}, '⚙️ Options'), el('div', { class: 'inner' },
    el('label', {}, 'Titre', title), el('label', {}, 'Message', message),
    el('div', { class: 'row' }, el('label', {}, 'Expiration', days), el('label', {}, 'Téléchargements max', maxDl)),
    el('label', {}, 'Mot de passe de téléchargement', password, el('span', { class: 'hint' }, 'En plus de la clé du lien : à communiquer séparément.')))),
  el('details', {}, el('summary', {}, '✉️ Envoyer aussi par e-mail (facultatif)'), el('div', { class: 'inner' },
    el('p', { class: 'hint' }, cfg.mail ? 'Le serveur enverra le lien aux destinataires.' : 'Après l\'envoi, un bouton ouvrira votre messagerie avec le lien prêt à envoyer.'),
    el('div', { class: 'row' }, el('label', {}, 'Votre e-mail', email), el('label', {}, 'Destinataires', to)))),
  errBox, send);
  document.title = 'SpeedPost · envoi de fichiers chiffré';
  $app.replaceChildren(el('div', { class: 'head' }, el('h1', {}, 'Envoyer des fichiers'), el('div', { class: 'sub' }, 'Sans compte · chiffré · un simple lien à partager')), form);
}

function donePage(entry, meta = {}) {
  const input = el('input', { type: 'text', readonly: true, value: entry.url, onfocus: (e) => e.target.select(), 'aria-label': 'Lien de partage' });
  const copy = el('button', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(entry.url); copy.textContent = '✓ Copié'; setTimeout(() => { copy.textContent = '📋 Copier'; }, 2000); } catch { input.select(); } } }, '📋 Copier');
  const actions = el('div', { class: 'actions' });
  if (navigator.share) actions.append(el('button', { type: 'button', class: 'ghost', onclick: () => navigator.share({ title: entry.title, url: entry.url }).catch(() => null) }, '📲 Partager'));
  const subject = entry.title || 'Des fichiers pour vous';
  const text = `${meta.message ? `${meta.message}\n\n` : ''}Téléchargez les fichiers ici : ${entry.url}\n(disponible jusqu'au ${fmtDate(entry.expiresAt)})${meta.from ? `\n\n${meta.from}` : ''}`;
  if (!meta.mailed) actions.append(el('a', { class: 'btn ghost', href: `mailto:${meta.to ? encodeURIComponent(meta.to).replace(/%40/g, '@').replace(/%2C/gi, ',') : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` }, '✉️ Par e-mail'));
  actions.append(el('a', { class: 'btn ghost', href: entry.url.replace(/^https?:\/\/[^/]+/, ''), target: '_blank', rel: 'noopener noreferrer' }, '👁️ Aperçu'));
  actions.append(el('a', { class: 'btn ghost', href: '/' }, '📤 Nouvel envoi'));
  page('C\'est en ligne ✅', `${entry.count} fichier${entry.count > 1 ? 's' : ''} · ${fmtSize(entry.size)} · jusqu'au ${fmtDate(entry.expiresAt)}`,
    el('div', { class: 'hero' }, '🚀'),
    el('p', { class: 'center' }, 'Partagez ce lien — c\'est tout ce qu\'il faut pour télécharger :'),
    el('div', { class: 'share' }, input, copy),
    meta.mailed ? el('p', { class: 'muted center' }, `✉️ Lien envoyé par e-mail à ${meta.mailed} destinataire(s).`) : null,
    actions,
    el('p', { class: 'muted' }, '🔐 Le lien contient la clé de déchiffrement : sans lui, personne — pas même le serveur — ne peut lire les fichiers. Il est aussi gardé dans « Mes envois » sur cet appareil.'));
}

// ------------------------------------------------------------------ Téléchargement
async function downloadPage(id, key) {
  if (!key) { fail('Lien incomplet', 'La clé de déchiffrement (la partie après « # ») manque. Copiez le lien en entier.'); return; }
  let info;
  try { info = await api('GET', `/api/transfers/${encodeURIComponent(id)}`, { headers: { 'x-transfer-key': key } }); } catch (err) { fail(err.status === 401 ? 'Lien incomplet' : 'Lien indisponible', err.message); return; }
  const total = info.files.reduce((n, f) => n + f.size, 0);
  const list = el('ul', { class: 'files' });
  const render = (token) => {
    list.replaceChildren(...info.files.map((f) => el('li', { class: 'file' }, el('span', { class: 'ic' }, iconFor(f.name)), el('span', { class: 'n', title: f.name }, f.name), el('span', { class: 's' }, fmtSize(f.size)),
      token ? el('a', { class: 'btn', href: `/api/transfers/${encodeURIComponent(id)}/files/${f.index}?t=${encodeURIComponent(token)}&c=${encodeURIComponent(key)}`, download: f.name, rel: 'noreferrer' }, '⬇️') : el('span', { class: 's' }, '🔒'))));
    all.classList.toggle('hidden', !token || info.files.length < 2);
    all.onclick = () => { for (const a of list.querySelectorAll('a[download]')) a.click(); };
  };
  const all = el('button', { type: 'button', class: 'hidden' }, `⬇️ Tout télécharger (${fmtSize(total)})`);
  const parts = [];
  if (info.message) parts.push(el('div', { class: 'msg' }, info.message));
  if (info.protected) {
    const pw = el('input', { type: 'password', placeholder: 'Mot de passe', autocomplete: 'off', required: true, 'aria-label': 'Mot de passe' });
    const err = el('p', { class: 'err hidden' });
    const btn = el('button', { type: 'submit' }, '🔓 Déverrouiller');
    const form = el('form', { class: 'share', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.classList.add('hidden');
      try { const r = await api('POST', `/api/transfers/${encodeURIComponent(id)}/unlock`, { body: { password: pw.value } }); render(r.token); form.remove(); lockHint.remove(); } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); } finally { btn.disabled = false; }
    } }, pw, btn);
    const lockHint = el('p', { class: 'muted' }, '🔒 Ce transfert est protégé par un mot de passe.');
    parts.push(lockHint, form, err);
  }
  parts.push(list, all);
  if (info.downloadsLeft !== null) parts.push(el('p', { class: 'muted' }, `Téléchargements restants : ${info.downloadsLeft}`));
  parts.push(el('p', { class: 'muted' }, `🔐 Chiffré (AES-256) · disponible jusqu'au ${fmtDate(info.expiresAt)}`));
  page(info.title || (info.files.length === 1 ? info.files[0].name : `${info.files.length} fichiers`), `${info.sender ? `De ${info.sender} · ` : ''}${fmtSize(total)}`, ...parts);
  render(info.protected ? null : info.token);
}

// ------------------------------------------------------------------ Mes envois (gardés sur cet appareil)
function sentPage() {
  const items = store.get(HISTORY, []);
  const listEl = el('div', { class: 'sent' });
  const draw = () => {
    const now = Date.now();
    const list = store.get(HISTORY, []);
    listEl.replaceChildren(...(list.length ? list.map((x) => el('div', { class: 'item' },
      el('div', {}, el('div', { class: 't', title: x.title }, `${x.expiresAt < now ? '⌛ ' : ''}${x.title}`), el('div', { class: 'muted' }, `${fmtSize(x.size)} · ${x.expiresAt < now ? 'expiré' : `jusqu'au ${fmtDate(x.expiresAt)}`}`)),
      el('div', { class: 'b' },
        el('button', { type: 'button', class: 'ghost', title: 'Copier le lien', onclick: (e) => { navigator.clipboard?.writeText(x.url); e.target.textContent = '✓'; } }, '📋'),
        el('a', { class: 'btn ghost', href: x.url.replace(/^https?:\/\/[^/]+/, ''), target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir' }, '↗'),
        el('button', { type: 'button', class: 'danger', title: 'Supprimer du serveur', onclick: async () => {
          if (!confirm('Supprimer définitivement ce transfert ?')) return;
          try { await api('DELETE', `/api/transfers/${x.id}`, { headers: { 'x-delete-token': x.deleteToken } }); } catch (err) { if (err.status !== 404) { alert(err.message); return; } }
          store.set(HISTORY, store.get(HISTORY, []).filter((y) => y.id !== x.id)); draw();
        } }, '🗑️')))) : [el('p', { class: 'muted center' }, 'Aucun envoi depuis cet appareil.')]));
  };
  draw();
  page('Mes envois', `${items.length} envoi(s) gardé(s) sur cet appareil`, listEl, el('a', { class: 'btn', href: '/' }, '📤 Nouvel envoi'));
}

function route() {
  const m = location.pathname.match(/^\/d\/([A-Za-z0-9_-]{8,64})\/?$/);
  if (m) downloadPage(m[1], location.hash.slice(1));
  else if (location.hash === '#envois') sentPage();
  else uploadPage();
}
window.addEventListener('hashchange', () => { if (!location.pathname.startsWith('/d/')) route(); });
route();
