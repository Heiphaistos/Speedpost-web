/**
 * Envoi du lien par e-mail — FACULTATIF.
 * Sans SMTP_URL, rien n'est envoyé par le serveur : le lien se copie/partage tel quel,
 * ou s'envoie depuis la messagerie de l'expéditeur (bouton mailto).
 */
import nodemailer from 'nodemailer';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createMailer(config) {
  if (!config.smtpUrl) return null;
  const transport = nodemailer.createTransport(config.smtpUrl);
  return {
    async sendLink({ to, from, link, title, message, files, totalSize, expiresAt }) {
      const subject = `${from ? `${from} vous envoie` : 'Vous avez reçu'} ${files.length > 1 ? `${files.length} fichiers` : 'un fichier'}${title ? ` : ${title}` : ''}`;
      const date = new Date(expiresAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
      const text = `${message ? `${message}\n\n` : ''}${files.map((f) => `• ${f}`).join('\n')}\n(${totalSize})\n\nTélécharger : ${link}\nDisponible jusqu'au ${date}.\n\n— ${config.appName}`;
      const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e3e5ea;border-radius:14px">
        <h2 style="margin:0 0 12px">${esc(subject)}</h2>${message ? `<p style="white-space:pre-wrap;background:#f3f4ff;padding:12px;border-radius:10px">${esc(message)}</p>` : ''}
        <ul>${files.slice(0, 30).map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p style="color:#666">${esc(totalSize)} · disponible jusqu'au ${esc(date)}</p>
        <p><a href="${esc(link)}" style="display:inline-block;background:#5865f2;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Télécharger</a></p>
        <p style="color:#888;font-size:12px">Fichiers chiffrés : la clé de déchiffrement est dans ce lien, ne le transférez qu'aux bonnes personnes.</p></div>`;
      await transport.sendMail({ from: config.mailFrom || `${config.appName} <no-reply@localhost>`, to, replyTo: from || undefined, subject, text, html });
    },
  };
}
