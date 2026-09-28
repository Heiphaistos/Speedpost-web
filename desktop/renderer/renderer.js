// SpeedPost pour Windows — interface (aucun accès Node : tout passe par window.speedpost).
/* global speedpost */
const $app = document.getElementById('app');
let files = [];
let sending = false;

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
const fmtDate = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const head = (title, sub) => el('div', { class: 'head' }, el('h1', {}, title), sub ? el('div', { class: 'sub' }, sub) : null);

function tab(name) {
  if (sending && name !== 'send') return;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
  ({ send: sendView, history: historyView, settings: settingsView })[name]();
}
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => tab(b.dataset.tab));

function addFiles(list) {
  for (const f of list) if (!files.some((x) => x.path === f.path)) files.push(f);
  if (!sending) tab('send');
}
speedpost.onFiles(addFiles);

// ------------------------------------------------------------------ Envoyer
async function sendView() {
  const s = await speedpost.getSettings();
  const list = el('ul', { class: 'files' });
  const drop = el('div', { class: 'drop', tabindex: '0', role: 'button', onclick: async () => addFiles(await speedpost.pickFiles()) },
    el('div', { class: 'big' }, '📤'), el('b', {}, 'Glissez vos fichiers ici'), el('span', { class: 'muted' }, 'ou cliquez · clic droit sur un fichier → Envoyer vers → SpeedPost'));
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', async (e) => addFiles(await speedpost.describeDropped(e.dataTransfer.files)));
  const draw = () => {
    list.replaceChildren(...files.map((f, i) => el('li', { class: 'file' }, el('span', { class: 'ic' }, '📄'), el('span', { class: 'n', title: f.path }, f.name), el('span', { class: 's' }, fmtSize(f.size)),
      el('button', { type: 'button', class: 'x', title: 'Retirer', onclick: () => { files.splice(i, 1); draw(); } }, '✕'))));
    send.disabled = !files.length;
    send.textContent = files.length ? `🚀 Envoyer ${files.length} fichier${files.length > 1 ? 's' : ''} (${fmtSize(files.reduce((n, f) => n + f.size, 0))})` : '🚀 Obtenir le lien';
  };
  const title = el('input', { type: 'text', maxlength: '150', placeholder: 'Facultatif' });
  const message = el('textarea', { maxlength: '3000', placeholder: 'Facultatif' });
  const days = el('select', {}, ...[1, 2, 3, 7, 14, 30, 60, 90].map((d) => el('option', { value: String(d), selected: d === Number(s.days) }, d === 1 ? '1 jour' : `${d} jours`)));
  const password = el('input', { type: 'password', placeholder: 'Facultatif' });
  const to = el('input', { type: 'text', placeholder: 'Facultatif : destinataire@exemple.fr' });
  const errBox = el('p', { class: 'err hidden' });
  const send = el('button', { type: 'submit', disabled: true }, '🚀 Obtenir le lien');
  const form = el('form', { class: 'body', onsubmit: async (e) => {
    e.preventDefault(); if (!files.length) return;
    errBox.classList.add('hidden');
    sending = true;
    const total = files.reduce((n, f) => n + f.size, 0);
    const bar = el('i'); const info = el('div', { class: 'speed' }); const t0 = Date.now();
    const cancel = el('button', { type: 'button', class: 'danger', onclick: () => speedpost.cancel() }, 'Annuler');
    $app.replaceChildren(head('Envoi en cours…', `${files.length} fichier(s) · ${fmtSize(total)}`), el('div', { class: 'body' }, el('div', { class: 'progress' }, bar), info, cancel));
    speedpost.onProgress((p) => {
      bar.style.width = `${p.total ? Math.round((p.totalSent / p.total) * 100) : 100}%`;
      const rate = p.totalSent / Math.max(1, (Date.now() - t0) / 1000);
      info.replaceChildren(el('span', {}, `${p.name} — ${fmtSize(p.totalSent)} / ${fmtSize(p.total)}`), el('span', {}, `${fmtSize(rate)}/s${rate > 0 ? ` · ${Math.max(0, Math.round((p.total - p.totalSent) / rate))} s` : ''}`));
    });
    try {
      const r = await speedpost.send(files.map((f) => f.path), { title: title.value.trim(), message: message.value.trim(), days: Number(days.value), password: password.value, to: to.value.trim(), email: s.email });
      files = []; sending = false;
      doneView(r, s, to.value.trim(), message.value.trim());
    } catch (err) {
      sending = false; await sendView();
      const box = $app.querySelector('.err'); box.textContent = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); box.classList.remove('hidden');
    }
  } },
  drop, list,
  el('details', {}, el('summary', {}, '⚙️ Options'), el('div', { class: 'inner' },
    el('label', {}, 'Titre', title), el('label', {}, 'Message', message),
    el('div', { class: 'row' }, el('label', {}, 'Expiration', days), el('label', {}, 'Mot de passe', password)),
    el('label', {}, 'E-mail du destinataire', to))),
  errBox, send);
  $app.replaceChildren(head('Envoyer des fichiers', `Serveur : ${s.server.replace(/^https?:\/\//, '')}`), form);
  draw();
}

function doneView(r, s, to, message) {
  const input = el('input', { type: 'text', readonly: true, value: r.url, onfocus: (e) => e.target.select() });
  const copy = el('button', { type: 'button', onclick: async () => { await speedpost.copy(r.url); copy.textContent = '✓ Copié'; } }, s.autoCopy ? '✓ Copié' : '📋 Copier');
  const text = `${message ? `${message}\n\n` : ''}Téléchargez les fichiers ici : ${r.url}\n(disponible jusqu'au ${fmtDate(r.expiresAt)})`;
  $app.replaceChildren(head('C\'est en ligne ✅', `${r.count} fichier(s) · ${fmtSize(r.size)} · jusqu'au ${fmtDate(r.expiresAt)}`), el('div', { class: 'body' },
    el('div', { class: 'hero' }, '🚀'),
    el('p', { class: 'center' }, s.autoCopy ? 'Le lien est déjà copié : collez-le où vous voulez.' : 'Partagez ce lien :'),
    el('div', { class: 'share' }, input, copy),
    el('div', { class: 'actions' },
      r.mailed ? null : el('button', { type: 'button', class: 'ghost', onclick: () => speedpost.open(`mailto:${encodeURIComponent(to).replace(/%40/g, '@').replace(/%2C/gi, ',')}?subject=${encodeURIComponent(r.title)}&body=${encodeURIComponent(text)}`) }, '✉️ Par e-mail'),
      el('button', { type: 'button', class: 'ghost', onclick: () => speedpost.open(r.url) }, '👁️ Aperçu'),
      el('button', { type: 'button', class: 'ghost', onclick: () => tab('send') }, '📤 Nouvel envoi')),
    el('p', { class: 'muted' }, '🔐 Le lien contient la clé de déchiffrement. Il reste disponible dans « Mes envois ».')));
}

// ------------------------------------------------------------------ Mes envois
async function historyView() {
  const list = await speedpost.history();
  const now = Date.now();
  const box = el('div', { class: 'sent' }, ...(list.length ? list.map((x) => el('div', { class: 'item' },
    el('div', {}, el('div', { class: 't', title: x.title }, `${x.expiresAt < now ? '⌛ ' : ''}${x.title}`), el('div', { class: 'muted' }, `${fmtSize(x.size)} · ${fmtDate(x.createdAt)} · ${x.expiresAt < now ? 'expiré' : `jusqu'au ${fmtDate(x.expiresAt)}`}`)),
    el('div', { class: 'b' },
      el('button', { type: 'button', class: 'ghost', title: 'Copier le lien', onclick: async (e) => { await speedpost.copy(x.url); e.target.textContent = '✓'; } }, '📋'),
      el('button', { type: 'button', class: 'ghost', title: 'Ouvrir', onclick: () => speedpost.open(x.url) }, '↗'),
      el('button', { type: 'button', class: 'danger', title: 'Supprimer du serveur', onclick: async () => { if (confirm('Supprimer définitivement ce transfert ?')) { await speedpost.deleteTransfer(x.id).catch((err) => alert(err.message)); historyView(); } } }, '🗑️')))) : [el('p', { class: 'muted center' }, 'Aucun envoi pour le moment.')]));
  $app.replaceChildren(head('Mes envois', `${list.length} envoi(s)`), el('div', { class: 'body' }, box));
}

// ------------------------------------------------------------------ Réglages
async function settingsView() {
  const s = await speedpost.getSettings();
  const server = el('input', { type: 'url', value: s.server, placeholder: 'https://speedpost.mondomaine.fr', required: true });
  const pw = el('input', { type: 'password', value: s.uploadPassword, placeholder: 'Seulement si le serveur est privé' });
  const email = el('input', { type: 'email', value: s.email, placeholder: 'Facultatif' });
  const days = el('select', {}, ...[1, 2, 3, 7, 14, 30, 60, 90].map((d) => el('option', { value: String(d), selected: d === Number(s.days) }, `${d} jour${d > 1 ? 's' : ''}`)));
  const autoCopy = el('input', { type: 'checkbox', checked: !!s.autoCopy, style: 'width:auto' });
  const status = el('p', { class: 'muted' });
  const form = el('form', { class: 'body', onsubmit: async (e) => {
    e.preventDefault(); status.className = 'muted'; status.textContent = 'Vérification du serveur…';
    try {
      const c = await speedpost.checkServer(server.value);
      await speedpost.saveSettings({ server: server.value, uploadPassword: pw.value, email: email.value.trim(), days: Number(days.value), autoCopy: autoCopy.checked });
      status.textContent = `✓ Enregistré — ${c.appName} : ${fmtSize(c.maxFileBytes)} max par fichier${c.needsPassword ? ', mot de passe d\'envoi requis' : ''}.`;
    } catch (err) { status.className = 'err'; status.textContent = `Serveur injoignable : ${String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`; }
  } },
  el('label', {}, 'Adresse du serveur SpeedPost', server),
  el('label', {}, 'Mot de passe d\'envoi', pw),
  el('div', { class: 'row' }, el('label', {}, 'Votre e-mail', email), el('label', {}, 'Expiration par défaut', days)),
  el('label', { style: 'display:flex;gap:8px;align-items:center' }, autoCopy, 'Copier le lien automatiquement à la fin de l\'envoi'),
  el('button', { type: 'submit' }, 'Enregistrer'), status);
  $app.replaceChildren(head('Réglages', 'Enregistrés sur cet ordinateur'), form);
}

speedpost.getSettings().then((s) => tab(/example\.com/.test(s.server) ? 'settings' : 'send'));
