// Génère les pages du site vitrine (en-tête et pied de page communs) : node scripts/build-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const NAV = [['index.html', 'Accueil'], ['fonctionnalites.html', 'Fonctionnalités'], ['securite.html', 'Sécurité'], ['telecharger.html', 'Applications'], ['faq.html', 'FAQ']];

function page(file, title, desc, body) {
  const links = NAV.map(([f, t]) => `<a href="/${f === 'index.html' ? '' : f}"${f === file ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#4f46e5">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <title>${title}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/site.css">
</head>
<body>
  <header class="nav"><div class="wrap">
    <a class="brand" href="/"><img src="/favicon.svg" alt=""><span>Speed<b>Post</b></span></a>
    <button class="menu" type="button" aria-label="Menu" aria-expanded="false">☰</button>
    <nav class="links">${links}<a class="btn small" href="/app">Envoyer des fichiers</a></nav>
  </div></header>
  <main>
${body}
  </main>
  <footer><div class="wrap">
    <div><strong>SpeedPost</strong> — envoi de fichiers chiffré, auto-hébergé.</div>
    <nav><a href="/app">Application web</a><a href="/telecharger.html">Windows &amp; Linux</a><a href="/securite.html">Sécurité</a><a href="/faq.html">FAQ</a><a href="/mentions-legales.html">Mentions légales</a><a href="/confidentialite.html">Confidentialité</a><a href="/cgu.html">CGU</a></nav>
  </div></footer>
  <script src="/site.js"></script>
</body>
</html>
`;
}

const CTA = `    <section><div class="wrap"><div class="band">
      <h2>Prêt à envoyer ?</h2>
      <p class="sub" style="margin-inline:auto">Aucun compte, aucune installation : glissez vos fichiers, copiez le lien.</p>
      <div class="cta" style="justify-content:center"><a class="btn" href="/app">🚀 Envoyer des fichiers</a><a class="btn ghost" href="/telecharger.html">Applications Windows &amp; Linux</a></div>
    </div></div></section>`;
const head = (eyebrow, h1, sub = '') => `    <div class="wrap page-head"><span class="eyebrow">${eyebrow}</span><h1>${h1}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
const card = (ic, h, p) => `<div class="card"><div class="ic">${ic}</div><h3>${h}</h3><p>${p}</p></div>`;

const pages = {};

pages['index.html'] = page('index.html', 'SpeedPost — envoi de fichiers volumineux, chiffré, sans compte', 'Envoyez des fichiers volumineux par simple lien. Chiffrés AES-256, sans compte, e-mail facultatif. Web, Windows et Linux.', `    <section class="hero"><div class="speed" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span class="plane" aria-hidden="true"></span><div class="wrap">
      <div>
        <span class="eyebrow">🔐 Chiffré · sans compte · auto-hébergé</span>
        <h1>Vos fichiers, <span class="grad">à la vitesse d'un lien.</span></h1>
        <p class="lead">Glissez vos documents, photos, vidéos ou applications : SpeedPost vous donne un lien à partager. Pas de compte, pas d'e-mail obligatoire, et des fichiers chiffrés que personne d'autre ne peut lire.</p>
        <div class="cta"><a class="btn" href="/app">🚀 Envoyer des fichiers</a><a class="btn ghost" href="/telecharger.html">⬇️ Windows &amp; Linux</a></div>
        <div class="trust"><span>✓ Jusqu'à 10 Go par fichier</span><span>✓ Reprise automatique</span><span>✓ Expiration au choix</span></div>
      </div>
      <div class="mock" aria-hidden="true">
        <div class="drop">📤<b>Glissez vos fichiers ici</b>ou cliquez pour les choisir</div>
        <div class="f">🎬 Vidéo mariage.mp4 <span>3,2 Go</span></div><div class="bar"><i style="width:72%"></i></div>
        <div class="f">📕 Contrat signé.pdf <span>1,4 Mo</span></div><div class="bar"><i style="width:100%"></i></div>
        <div class="link"><code><span class="here-host">speedpost</span>/d/Ck7i8zQ2#FYGW6Qag…</code><span class="btn small">📋 Copier</span></div>
      </div>
    </div></section>

    <section class="alt"><div class="wrap center">
      <h2>Trois étapes, zéro prise de tête</h2>
      <p class="sub">Pas d'inscription, pas de formulaire interminable.</p>
      <div class="steps" style="text-align:left">
        <div class="card"><h3>Déposez</h3><p>Glissez un ou plusieurs fichiers dans la page, ou faites clic droit → <em>Envoyer vers SpeedPost</em> sur votre ordinateur.</p></div>
        <div class="card"><h3>Envoyez</h3><p>Les fichiers partent par morceaux et sont chiffrés à l'arrivée. Une coupure ? L'envoi reprend tout seul.</p></div>
        <div class="card"><h3>Partagez le lien</h3><p>Collez-le dans un message, un chat, un SMS… ou envoyez-le par e-mail si vous préférez.</p></div>
      </div>
    </div></section>

    <section><div class="wrap">
      <h2>Tout ce qu'il faut, rien de trop</h2>
      <p class="sub">Pensé pour envoyer vite des documents, des applications, des photos ou des vidéos, à soi-même ou aux autres.</p>
      <div class="grid">
        ${card('🔐', 'Chiffrement AES-256', 'Une clé unique par envoi, qui n\'existe que dans votre lien. Le serveur ne la garde jamais.')}
        ${card('🙅', 'Sans compte', 'Aucune inscription. L\'e-mail est facultatif : un lien suffit.')}
        ${card('📦', 'Gros fichiers', 'Jusqu\'à 10 Go par fichier et 200 fichiers par envoi (réglable sur votre serveur).')}
        ${card('⏳', 'Vous gardez la main', 'Expiration, nombre de téléchargements, mot de passe, suppression à tout moment.')}
        ${card('🪟', 'Web, Windows, Linux', 'Dans le navigateur, ou avec les applications de bureau qui copient le lien automatiquement.')}
        ${card('🏠', 'Chez vous', 'Hébergé sur votre propre serveur : vos fichiers ne passent par aucun service tiers.')}
      </div>
      <p class="center" style="margin-top:28px"><a href="/fonctionnalites.html">Voir toutes les fonctionnalités →</a></p>
    </div></section>
${CTA}`);

pages['fonctionnalites.html'] = page('fonctionnalites.html', 'Fonctionnalités — SpeedPost', 'Toutes les fonctionnalités de SpeedPost : envoi par lien, chiffrement, reprise, expiration, mot de passe, applications Windows et Linux.', `${head('✨ Fonctionnalités', 'Tout ce que fait SpeedPost', 'Un outil simple en surface, solide en dessous.')}
    <section style="padding-top:8px"><div class="wrap grid">
      ${card('🔗', 'Un lien, c\'est tout', 'Chaque envoi donne un lien court. Aucun compte, ni pour l\'expéditeur ni pour le destinataire.')}
      ${card('✉️', 'E-mail facultatif', 'Envoyez le lien depuis votre messagerie en un clic, ou laissez le serveur l\'envoyer (si configuré).')}
      ${card('📁', 'Plusieurs fichiers', 'Glisser-déposer, sélection multiple, coller depuis le presse-papiers (Ctrl+V).')}
      ${card('🔁', 'Reprise automatique', 'Envoi par morceaux de 48 Mo : une coupure réseau ne fait pas tout recommencer. Les téléchargements reprennent aussi.')}
      ${card('⏳', 'Expiration', 'De 1 jour à 1 an. Les fichiers expirés sont supprimés automatiquement du serveur.')}
      ${card('🔢', 'Téléchargements limités', 'Autodestruction après N téléchargements, idéal pour un document sensible.')}
      ${card('🔑', 'Mot de passe', 'Une protection en plus de la clé du lien, à communiquer séparément.')}
      ${card('🗂️', 'Mes envois', 'Retrouvez vos liens sur votre appareil, recopiez-les ou supprimez un envoi du serveur.')}
      ${card('📱', 'Mobile', 'L\'application web s\'adapte au téléphone, avec le partage natif du lien.')}
    </div></section>
    <section class="alt"><div class="wrap">
      <h2>Web, Windows ou Linux ?</h2><p class="sub">Même serveur, mêmes liens : choisissez selon vos habitudes.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Fonction</th><th>Web</th><th>Windows</th><th>Linux</th></tr></thead>
        <tbody>
          <tr><td>Envoi par glisser-déposer</td><td>✓</td><td>✓</td><td>✓</td></tr>
          <tr><td>Clic droit sur un fichier</td><td>—</td><td>Envoyer vers</td><td>Ouvrir avec</td></tr>
          <tr><td>Lien copié automatiquement</td><td>—</td><td>✓</td><td>✓</td></tr>
          <tr><td>Notification de fin d'envoi</td><td>—</td><td>✓</td><td>✓</td></tr>
          <tr><td>Progression dans la barre des tâches</td><td>—</td><td>✓</td><td>selon le bureau</td></tr>
          <tr><td>Historique des envois</td><td>✓</td><td>✓</td><td>✓</td></tr>
          <tr><td>Réception des fichiers</td><td>✓</td><td>via le navigateur</td><td>via le navigateur</td></tr>
        </tbody>
      </table></div>
    </div></section>
${CTA}`);

pages['securite.html'] = page('securite.html', 'Sécurité — SpeedPost', 'Comment SpeedPost chiffre vos fichiers : AES-256-GCM, clé unique par envoi conservée uniquement dans le lien.', `${head('🔐 Sécurité', 'Vos fichiers ne sont lisibles qu\'avec votre lien', 'Voici exactement ce qui est protégé, et comment.')}
    <section style="padding-top:8px"><div class="wrap split">
      <div>
        <h2>Une clé par envoi, uniquement dans le lien</h2>
        <p class="sub">À chaque envoi, votre appareil génère une clé aléatoire de 256 bits. Elle est placée après le « # » du lien : cette partie n'est jamais transmise quand on ouvre la page, et le serveur ne l'enregistre jamais.</p>
        <ul class="checks">
          <li>Fichiers chiffrés en AES-256-GCM, par blocs authentifiés de 1 Mio</li>
          <li>Noms de fichiers, titre, message et e-mails chiffrés eux aussi</li>
          <li>Toute modification ou troncature d'un fichier est détectée</li>
          <li>Téléchargement déchiffré à la volée : aucun fichier en clair sur le disque</li>
          <li>Pas de journal des liens côté serveur (configuration fournie)</li>
        </ul>
      </div>
      <div class="card">
        <p class="muted" style="margin-top:0">Anatomie d'un lien</p>
        <p style="font-family:ui-monospace,monospace;word-break:break-all;font-size:15px">https://<span class="here-host">speedpost</span>/d/<span class="pill">Ck7i8zQ2olQM</span>#<span class="pill" style="background:color-mix(in srgb,#ec4899 18%,transparent);color:#f472b6">FYGW6QagFt8ydek_STYQ…</span></p>
        <p class="muted">🟦 Identifiant de l'envoi — connu du serveur.<br>🟪 Clé de déchiffrement — connue de vous seul et des personnes à qui vous donnez le lien.</p>
      </div>
    </div></section>
    <section class="alt"><div class="wrap grid">
      ${card('🛡️', 'Ce qui est protégé', 'Les fichiers stockés : vol du disque, sauvegardes, accès au serveur. Sans le lien, un administrateur ne voit que des données chiffrées et des tailles.')}
      ${card('⚠️', 'Ce qu\'il faut savoir', 'Pendant un envoi ou un téléchargement, le serveur utilise la clé en mémoire, le temps de la requête. Perdre le lien, c\'est perdre l\'accès aux fichiers.')}
      ${card('🔑', 'Défense en profondeur', 'Mot de passe facultatif (scrypt), limite de téléchargements, expiration, jetons signés à durée limitée, en-têtes de sécurité stricts.')}
    </div></section>
${CTA}`);

pages['telecharger.html'] = page('telecharger.html', 'Applications Windows et Linux — SpeedPost', 'Téléchargez SpeedPost pour Windows (installateur ou portable) et Linux (AppImage, .deb).', `${head('⬇️ Applications', 'SpeedPost sur votre ordinateur', 'Envoyez un fichier en deux clics depuis l\'explorateur, le lien est copié tout seul. Gratuit et open source.')}
    <section style="padding-top:8px"><div class="wrap">
      <div class="dl">
        <div class="card" data-os="windows"><div class="os">🪟</div><h2 style="font-size:26px;margin:0">Windows</h2>
          <p class="muted">Windows 10 et 11 (64 bits). Installateur ou version portable sans installation. Clic droit → <em>Envoyer vers → SpeedPost</em>.</p>
          <div class="files" data-files="windows"><span class="muted">Recherche des versions…</span></div></div>
        <div class="card" data-os="linux"><div class="os">🐧</div><h2 style="font-size:26px;margin:0">Linux</h2>
          <p class="muted">AppImage (toutes distributions) ou paquet .deb (Debian, Ubuntu, Mint). Clic droit → <em>Ouvrir avec → SpeedPost</em>.</p>
          <div class="files" data-files="linux"><span class="muted">Recherche des versions…</span></div></div>
        <div class="card"><div class="os">🌐</div><h2 style="font-size:26px;margin:0">Navigateur</h2>
          <p class="muted">Rien à installer : fonctionne sur ordinateur, tablette et téléphone.</p>
          <div class="files"><a class="btn" href="/app">Ouvrir l'application web</a></div></div>
      </div>
    </div></section>
    <section class="alt"><div class="wrap prose">
      <h2>Premier lancement</h2>
      <p>Dans <strong>Réglages</strong>, indiquez l'adresse de ce site : <code class="here-url">https://…</code>. Si le serveur est privé, saisissez aussi le mot de passe d'envoi : il est mémorisé.</p>
      <h2>Linux</h2>
      <p>AppImage : rendez le fichier exécutable (<code>chmod +x SpeedPost-*.AppImage</code>) puis lancez-le. Paquet .deb : <code>sudo apt install ./SpeedPost-*.deb</code>.</p>
      <h2>Windows : avertissement SmartScreen</h2>
      <p>L'application n'étant pas signée par un certificat payant, Windows peut afficher « Windows a protégé votre ordinateur ». Cliquez sur <em>Informations complémentaires → Exécuter quand même</em>.</p>
    </div></section>`);

const faq = [
  ['Faut-il créer un compte ?', 'Non. Ni pour envoyer, ni pour télécharger. Un lien suffit.'],
  ['Dois-je donner mon adresse e-mail ?', 'Non, c\'est facultatif. Copiez simplement le lien et collez-le où vous voulez. Si vous indiquez un destinataire, le lien peut lui être envoyé par e-mail.'],
  ['Quelle taille maximale ?', 'Par défaut 10 Go par fichier et 200 fichiers par envoi. L\'administrateur du serveur peut changer ces limites.'],
  ['Combien de temps mes fichiers restent-ils disponibles ?', 'Vous choisissez, de 1 jour à 1 an selon la configuration du serveur. Ils sont ensuite supprimés automatiquement. Vous pouvez aussi les supprimer vous-même depuis « Mes envois ».'],
  ['J\'ai perdu le lien, pouvez-vous le retrouver ?', 'Non, et c\'est voulu : la clé de déchiffrement n\'existe que dans le lien. Il est peut-être encore dans « Mes envois » sur l\'appareil qui a envoyé les fichiers.'],
  ['Le destinataire voit « Lien incomplet »', 'Le lien a été coupé : la partie après le « # » contient la clé. Renvoyez le lien en entier.'],
  ['Mon envoi a été interrompu', 'Les coupures courtes sont reprises automatiquement. Si la page a été fermée, relancez simplement l\'envoi.'],
  ['Puis-je héberger mon propre SpeedPost ?', 'Oui : le code est libre (licence MIT). Une commande suffit sur un VPS Debian/Ubuntu, certificat HTTPS compris.'],
];
pages['faq.html'] = page('faq.html', 'Questions fréquentes — SpeedPost', 'Réponses aux questions sur SpeedPost : compte, e-mail, taille, durée, lien perdu, auto-hébergement.', `${head('❓ FAQ', 'Questions fréquentes')}
    <section style="padding-top:8px"><div class="wrap prose">
${faq.map(([q, a]) => `      <details class="q"><summary>${q}</summary><div>${a}</div></details>`).join('\n')}
    </div></section>
${CTA}`);

// Pages légales propres à ce site. Date de mise à jour écrite en dur.
const UPDATED = '1er octobre 2026';
const MAIL = '<a href="mailto:contact.forgeinformatique@heiphaistos.org" style="word-break:break-all">contact.forgeinformatique@heiphaistos.org</a>';
const legalHead = (eyebrow, h1) => head(eyebrow, h1, `Dernière mise à jour : ${UPDATED}`);

pages['mentions-legales.html'] = page('mentions-legales.html', 'Mentions légales — SpeedPost', 'Éditeur, hébergeur et propriété intellectuelle du site SpeedPost.', `${legalHead('📄 Mentions légales', 'Mentions légales')}
    <section style="padding-top:8px"><div class="wrap prose">
      <h2>Éditeur du site</h2>
      <p>Le site <strong>speedpost.heiphaistos.org</strong> est édité à titre personnel et non professionnel par une personne physique publiant sous le pseudonyme <strong>Heiphaistos</strong>.</p>
      <p>Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN, article 6-III-2), l'éditeur, non professionnel, a choisi de préserver son anonymat. Ses éléments d'identification ont été communiqués à l'hébergeur, qui en garantit la confidentialité.</p>
      <p>Contact : ${MAIL}</p>
      <h2>Directeur de la publication</h2>
      <p>L'éditeur du site, tel que désigné ci-dessus.</p>
      <h2>Hébergement</h2>
      <p><strong>IONOS SE</strong> — Elgendorfer Str. 57, 56410 Montabaur, Allemagne — Tél. : +49 721 170 555 — <a href="https://www.ionos.fr" rel="noopener">ionos.fr</a></p>
      <h2>Propriété intellectuelle</h2>
      <p>Les textes, visuels et logos de ce site sont la propriété de leur éditeur. Le code de SpeedPost est publié sous licence MIT sur GitHub. Les fichiers envoyés restent la propriété de leurs auteurs : l'éditeur ne les consulte pas et ne peut pas les lire (ils sont chiffrés avec une clé qu'il ne possède pas).</p>
      <h2>Responsabilité</h2>
      <p>L'éditeur s'efforce de maintenir des informations exactes et à jour, sans pouvoir le garantir. Il ne peut être tenu responsable des erreurs, omissions ou dommages résultant de l'utilisation de ce site.</p>
      <h2>Signaler un contenu</h2>
      <p>Pour signaler un fichier illicite (en joignant le lien concerné) ou une erreur : ${MAIL}. L'envoi signalé est supprimé dès que son caractère illicite est établi.</p>
    </div></section>`);

pages['confidentialite.html'] = page('confidentialite.html', 'Confidentialité — SpeedPost', 'Données traitées par SpeedPost, durées de conservation et droits RGPD.', `${legalHead('📄 Confidentialité', 'Confidentialité')}
    <section style="padding-top:8px"><div class="wrap prose">
      <p>En bref : pas de compte, pas de cookie, pas de publicité, pas de mesure d'audience. Vos fichiers sont chiffrés avec une clé qui n'existe que dans votre lien. Cette politique ne concerne que ce site.</p>
      <h2>Responsable de traitement</h2>
      <p>L'éditeur du site (voir les <a href="/mentions-legales.html">mentions légales</a>), joignable à ${MAIL}.</p>
      <h2>Ce qui est conservé sur le serveur</h2>
      <ul>
        <li>Les fichiers, <strong>chiffrés</strong>, jusqu'à leur expiration (au plus 30 jours sur ce serveur), leur dernier téléchargement autorisé ou leur suppression.</li>
        <li>Les informations facultatives que vous saisissez (titre, message, votre e-mail, les e-mails des destinataires), <strong>chiffrées</strong> avec la clé du lien.</li>
        <li>La taille des fichiers, les dates de création et d'expiration, le nombre de téléchargements et, si vous en avez mis un, le mot de passe sous forme hachée (scrypt).</li>
        <li>Une empreinte (hachage SHA-256) de l'adresse IP d'envoi, pour limiter les abus.</li>
      </ul>
      <p>Tout est effacé avec l'envoi : à son expiration, quand le nombre de téléchargements choisi est atteint, ou quand vous le supprimez. Base légale : exécution du service que vous demandez (article 6.1.b du RGPD) et intérêt légitime pour la lutte contre les abus (article 6.1.f).</p>
      <h2>Journaux techniques</h2>
      <p>Le serveur web ne tient aucun journal d'accès. L'application enregistre, pour chaque requête, l'adresse IP, la date et l'adresse demandée (sans la clé, qui n'est jamais transmise) dans un journal technique tournant limité à 150 Mo, dont les entrées les plus anciennes sont effacées au fur et à mesure. Finalité : sécurité et diagnostic. Base légale : intérêt légitime.</p>
      <h2>E-mails</h2>
      <p>Ce serveur n'envoie aucun e-mail : le lien se copie, se partage, ou s'envoie depuis votre propre messagerie.</p>
      <h2>Ce qui n'est pas conservé</h2>
      <ul><li>La clé de déchiffrement : elle n'existe que dans votre lien.</li><li>Aucun compte, aucun cookie, aucune statistique ni service tiers : polices, scripts et styles sont servis par ce site.</li></ul>
      <h2>Sur votre appareil</h2>
      <p>Le stockage local de votre navigateur (ou l'application de bureau) garde la liste « Mes envois » (liens et jetons de suppression), et, si vous les avez saisis, votre adresse e-mail et le mot de passe d'envoi de ce serveur privé. Rien de cela n'est envoyé ailleurs qu'à ce serveur. Effacez les données du site dans votre navigateur pour les supprimer.</p>
      <h2>Liens externes</h2>
      <p>La page Applications renvoie vers GitHub pour les anciennes versions ; GitHub ne reçoit rien tant que vous ne cliquez pas.</p>
      <h2>Contact par e-mail</h2>
      <p>Si vous écrivez à l'adresse de contact, votre message et votre adresse e-mail sont conservés le temps de traiter la demande, puis 3 ans au maximum.</p>
      <h2>Destinataires</h2>
      <p>Les données sont traitées sur un serveur hébergé par IONOS SE dans l'Union européenne. Elles ne sont ni vendues, ni cédées, ni utilisées pour du profilage ou de la publicité.</p>
      <h2>Vos droits</h2>
      <p>Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité (articles 15 à 22 du RGPD). Pour les exercer : ${MAIL} — réponse sous un mois. Vous pouvez aussi supprimer vous-même un envoi depuis « Mes envois ».</p>
      <p>En cas de désaccord, vous pouvez saisir la CNIL : <a href="https://www.cnil.fr" rel="noopener">cnil.fr</a>.</p>
    </div></section>`);

pages['cgu.html'] = page('cgu.html', "Conditions d'utilisation — SpeedPost", "Conditions générales d'utilisation du service d'envoi de fichiers SpeedPost.", `${legalHead('📄 CGU', "Conditions d'utilisation")}
    <section style="padding-top:8px"><div class="wrap prose">
      <p>Les présentes conditions générales d'utilisation (CGU) s'appliquent au site <strong>speedpost.heiphaistos.org</strong>, à son application web et aux applications de bureau lorsqu'elles utilisent ce serveur.</p>
      <h2>Objet</h2>
      <p>SpeedPost permet d'envoyer des fichiers chiffrés et de les partager par un lien. Ce serveur est <strong>privé</strong> : l'envoi est réservé aux personnes à qui l'éditeur a confié le mot de passe d'envoi. Le téléchargement est possible pour toute personne disposant d'un lien.</p>
      <h2>Acceptation</h2>
      <p>Utiliser le service vaut acceptation des présentes conditions. Si vous ne les acceptez pas, merci de ne pas l'utiliser.</p>
      <h2>Gratuité</h2>
      <p>Le service est gratuit, sans compte, sans abonnement ni publicité.</p>
      <h2>Contenus envoyés</h2>
      <p>Vous êtes seul responsable des fichiers que vous envoyez et des personnes à qui vous donnez le lien. Il est interdit d'envoyer des contenus illicites : contrefaçon, œuvres partagées sans droit, logiciels malveillants, contenus pédopornographiques, haineux ou portant atteinte à la vie privée d'autrui. L'éditeur ne peut pas lire les fichiers ; sur signalement, il supprime l'envoi concerné, peut retirer l'accès à l'envoi et coopère avec les autorités sur réquisition.</p>
      <h2>Mot de passe d'envoi</h2>
      <p>Le mot de passe d'envoi est personnel : ne le diffusez pas. L'éditeur peut le changer à tout moment.</p>
      <h2>Limites et durée</h2>
      <p>Jusqu'à 10 Go par fichier et 200 fichiers par envoi, pour une durée de 1 à 30 jours. Les envois expirés sont supprimés définitivement. Perdre le lien, c'est perdre l'accès aux fichiers : aucune récupération n'est possible.</p>
      <h2>Disponibilité et responsabilité</h2>
      <p>Le service est fourni « en l'état », sans garantie de disponibilité ni de conservation : gardez toujours une copie de vos fichiers. L'éditeur peut le modifier, le suspendre ou l'arrêter à tout moment, et ne pourra être tenu responsable d'une perte de données ou des dommages directs ou indirects résultant de son utilisation.</p>
      <h2>Comportement</h2>
      <p>Il est interdit de tenter de porter atteinte à la sécurité ou à la disponibilité du service (attaque, contournement des limites ou du mot de passe, saturation volontaire de l'espace de stockage).</p>
      <h2>Modification des conditions</h2>
      <p>Ces conditions peuvent évoluer ; la date de dernière mise à jour figure en haut de page.</p>
      <h2>Droit applicable</h2>
      <p>Les présentes conditions sont régies par le droit français. En cas de litige, une solution amiable sera recherchée avant toute action.</p>
      <h2>Contact</h2>
      <p>${MAIL}</p>
    </div></section>`);

for (const [f, html] of Object.entries(pages)) fs.writeFileSync(path.join(OUT, f), html);
console.log(`${Object.keys(pages).length} pages générées`);
