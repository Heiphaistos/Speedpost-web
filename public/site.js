// Site vitrine : menu mobile, adresse du site, liste des applications à télécharger.
const menu = document.querySelector('.menu');
const links = document.querySelector('.links');
menu?.addEventListener('click', () => { const open = links.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });

for (const e of document.querySelectorAll('.here-host')) e.textContent = location.host;
for (const e of document.querySelectorAll('.here-url')) e.textContent = location.origin;

const holders = document.querySelectorAll('[data-files]');
if (holders.length) {
  const os = /Windows/i.test(navigator.userAgent) ? 'windows' : /Linux|X11/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent) ? 'linux' : null;
  if (os) document.querySelector(`[data-os="${os}"]`)?.classList.add('me');
  const label = (name) => (/portable/i.test(name) ? 'Version portable (.exe)' : /\.exe$/i.test(name) ? 'Installateur (.exe)' : /\.appimage$/i.test(name) ? 'AppImage' : /\.deb$/i.test(name) ? 'Paquet .deb' : /\.rpm$/i.test(name) ? 'Paquet .rpm' : name);
  fetch('/api/downloads').then((r) => r.json()).then((d) => {
    for (const h of holders) {
      const platform = h.dataset.files;
      const files = d.files.filter((f) => f.platform === platform);
      h.replaceChildren();
      files.forEach((f, i) => {
        const a = document.createElement('a');
        a.className = `btn${i ? ' ghost' : ''}`; a.href = f.url; a.textContent = `⬇️ ${label(f.name)} · ${f.sizeText}`;
        h.append(a);
      });
      const gh = document.createElement('a');
      gh.className = files.length ? 'muted' : 'btn'; gh.href = d.releases[platform]; gh.rel = 'noopener'; gh.textContent = files.length ? 'Toutes les versions (GitHub)' : '⬇️ Télécharger (GitHub)';
      h.append(gh);
    }
  }).catch(() => { for (const h of holders) h.textContent = 'Liste indisponible.'; });
}

// Motion « Vitesse » : pause des boucles du héros hors écran ; repli IntersectionObserver si animation-timeline absent.
if ('IntersectionObserver' in window) {
  const hero = document.querySelector('.hero');
  if (hero) new IntersectionObserver((es) => hero.classList.toggle('off', !es[es.length - 1].isIntersecting)).observe(hero);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const marketing = document.querySelector('main .card, details.q');
  if (!calm && marketing && !CSS.supports('animation-timeline: view()')) {
    document.documentElement.classList.add('io');
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
    for (const el of document.querySelectorAll('main .card, main .wrap:not(.prose) > h2')) io.observe(el);
  }
}
