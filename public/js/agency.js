// Page d'accueil publique d'une agence : affiche les infos + les RDV disponibles.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const head = $('#agency-head');
const eventsBox = $('#agency-events');

async function api(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function locLabel(t) { return { video:'Visio', in_person:'En personne', phone:'Téléphone', custom:'Lieu' }[t] || t; }

(async function init() {
  const slug = location.pathname.split('/').filter(Boolean)[0];
  try {
    const a = await api(`/api/public/agency/${encodeURIComponent(slug)}`);
    document.title = a.name + ' — E-Lutetia Agenda';
    document.documentElement.style.setProperty('--blue', a.brand_color || '#0069ff');

    head.innerHTML = `
      <div style="flex:1;padding:34px;">
        <div class="bk-host-avatar" style="background:${a.brand_color||'#0069ff'};width:64px;height:64px;font-size:26px;margin-bottom:16px;">${a.name.trim().slice(0,1).toUpperCase()}</div>
        <h1 style="font-size:28px;margin-bottom:6px;">${esc(a.name)}</h1>
        ${a.description ? `<p style="color:#3f3f46;margin-bottom:18px;">${esc(a.description)}</p>` : ''}
        <div class="bk-meta">
          ${a.address ? `<div><span class="m-ico">📍</span> ${esc(a.address)}</div>` : ''}
          ${a.phone ? `<div><span class="m-ico">📞</span> ${esc(a.phone)}</div>` : ''}
          ${a.email ? `<div><span class="m-ico">✉️</span> ${esc(a.email)}</div>` : ''}
        </div>
        ${a.members.length ? `<div style="margin-top:18px;font-size:14px;color:var(--muted);">Équipe : ${esc(a.members.map(m=>m.name).join(', '))}</div>` : ''}
      </div>`;

    eventsBox.innerHTML = `
      <div style="flex:1;padding:34px;">
        <h2 style="font-size:20px;margin-bottom:6px;">Prendre rendez-vous</h2>
        <p style="color:var(--muted);font-size:14px;margin-bottom:20px;">Choisissez un type de rendez-vous :</p>
        ${a.events.length ? a.events.map(e => `
          <a href="${e.url}" style="text-decoration:none;color:inherit;display:block;">
            <div class="event-row" style="border:1px solid var(--border);border-radius:12px;margin-bottom:12px;">
              <div class="left">
                <div class="colorbar" style="background:${e.color||a.brand_color}"></div>
                <div>
                  <div class="e-name">${esc(e.name)}</div>
                  <div class="e-meta">${e.duration} min · ${esc(locLabel(e.location_type))}${e.location_detail?' · '+esc(e.location_detail):''}</div>
                  ${e.host_name ? `<div class="e-meta">avec ${esc(e.host_name)}</div>` : ''}
                </div>
              </div>
              <span class="btn btn-primary btn-sm">Réserver</span>
            </div>
          </a>
        `).join('') : '<div class="empty"><div class="e-ico">🗓️</div><h3>Aucun rendez-vous disponible pour le moment</h3></div>'}
      </div>`;
  } catch (e) {
    head.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);flex:1;">
      <div style="font-size:40px">🏢</div><h2>Agence introuvable</h2><p>${esc(e.message)}</p>
      <a class="btn btn-secondary" href="/" style="margin-top:16px;">Accueil</a></div>`;
    eventsBox.innerHTML = '';
  }
})();
