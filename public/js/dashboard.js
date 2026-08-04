// ============================================================
// E-Lutetia Agenda — Tableau de bord hôte (SPA)
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const DAYS = [
  { key: 'mon', label: 'Lundi' },
  { key: 'tue', label: 'Mardi' },
  { key: 'wed', label: 'Mercredi' },
  { key: 'thu', label: 'Jeudi' },
  { key: 'fri', label: 'Vendredi' },
  { key: 'sat', label: 'Samedi' },
  { key: 'sun', label: 'Dimanche' },
];

const COLORS = ['#0069ff', '#0ea5e9', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

const state = {
  user: null,
  tab: 'events',
  events: [],
  bookings: [],
};

let toastTimer;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Session expirée'); }
  if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function fmtDate(iso, tz) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(new Date(iso));
  } catch (_) {
    return new Date(iso).toLocaleString('fr-FR');
  }
}
function fmtTime(iso, tz) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
  } catch (_) {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}

// Affiche une durée en minutes sous forme lisible (heures)
function fmtDuration(mins) {
  mins = Number(mins) || 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h${m < 10 ? '0' : ''}${m}`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}

// ============================ Auth guard ============================
(async function boot() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    $('#user-name').textContent = user.name;
    $('#user-email').textContent = user.email;
    $('#user-avatar').textContent = user.name.slice(0, 1).toUpperCase();
    $('#share-link').href = `/${user.username}`;
    document.documentElement.style.setProperty('--blue', user.brand_color || '#0069ff');
    if (user.role === 'admin') {
      $('#nav-team').classList.remove('hidden');
    }
    $('#nav-links').classList.remove('hidden');
    $('#nav-availability').classList.remove('hidden');
    bindNav();
    bindLogout();
    render();
  } catch (e) {
    console.error('Dashboard boot error:', e && e.message);
    window.location.href = '/login';
  }
})();

function bindNav() {
  $$('.nav a[data-tab]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    state.tab = a.dataset.tab;
    $$('.nav a').forEach((x) => x.classList.toggle('active', x === a));
    render();
  }));
}

function bindLogout() {
  $('#logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

// ============================ Router ============================
function render() {
  const titles = { events: 'Types d\'événements', bookings: 'Réservations', settings: 'Paramètres', team: 'Équipe & Agences', links: 'Liens & Sondages', availability: 'Disponibilité' };
  $('#page-title').textContent = titles[state.tab];
  $('#crumb').textContent = 'Tableau de bord';
  if (state.tab === 'events') renderEvents();
  else if (state.tab === 'bookings') renderBookings();
  else if (state.tab === 'team') renderTeam();
  else if (state.tab === 'links') renderLinks();
  else if (state.tab === 'availability') renderAvailability();
  else renderSettings();
}

// ============================ Event types ============================
async function renderEvents() {
  const content = $('#content');
  content.innerHTML = `<div class="spinner"></div>`;
  try {
    const events = await api('/api/events');
    state.events = events;
    const rows = events.map((e) => `
      <div class="event-row" data-id="${e.id}">
        <div class="left">
          <div class="colorbar" style="background:${e.color}"></div>
          <div>
            <div class="e-name">${esc(e.name)}</div>
            <div class="e-meta">
              ${fmtDuration(e.duration)} · ${esc(e.location_type === 'video' ? 'En visio' : e.location_type === 'in_person' ? 'En personne' : e.location_type === 'phone' ? 'Téléphone' : 'Personnalisé')}
              · <a href="${e.booking_url}" target="_blank" onclick="event.stopPropagation()">${esc(e.booking_url)}</a>
              ${e.is_active ? '<span class="badge badge-green" style="margin-left:6px;">Actif</span>' : '<span class="badge badge-gray" style="margin-left:6px;">Inactif</span>'}
            </div>
          </div>
        </div>
        <div class="e-actions">
          <button class="btn btn-secondary btn-sm" data-act="edit">Modifier</button>
          <button class="btn btn-danger btn-sm" data-act="del">Supprimer</button>
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
        <button class="btn btn-primary" id="new-event">+ Nouveau type d'événement</button>
      </div>
      ${events.length ? `<div class="card">${rows}</div>` : `<div class="card"><div class="empty"><div class="e-ico">🗓️</div><h3>Aucun événement</h3><p>Créez votre premier type d'événement pour obtenir un lien de réservation.</p><br><button class="btn btn-primary" id="new-event-empty">Créer un événement</button></div></div>`}
    `;

    $('#new-event')?.addEventListener('click', () => openEventModal());
    $('#new-event-empty')?.addEventListener('click', () => openEventModal());
    $$('.event-row').forEach((row) => {
      const id = row.dataset.id;
      const ev = events.find((e) => String(e.id) === id);
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="del"]')) {
          deleteEvent(ev);
        } else if (e.target.closest('[data-act="edit"]')) {
          openEventModal(ev);
        }
      });
    });
  } catch (e) {
    content.innerHTML = `<div class="card"><div class="error-msg" style="padding:20px">${esc(e.message)}</div></div>`;
  }
}

async function deleteEvent(ev) {
  if (!confirm(`Supprimer le type d'événement « ${ev.name} » ?`)) return;
  try {
    await api(`/api/events/${ev.id}`, { method: 'DELETE' });
    toast('Événement supprimé');
    renderEvents();
  } catch (e) { toast(e.message); }
}

// ---------- Modal création / édition ----------
function openEventModal(existing) {
  const isEdit = !!existing;
  const e = existing || {
    name: '', slug: '', description: '', duration: 30, slot_interval: 0,
    location_type: 'video', location_detail: '', address: '', organizer: state.user.name,
    color: state.user.brand_color,
    buffer_before: 0, buffer_after: 0, daily_limit: 0, min_notice_minutes: 0,
    is_active: true, availability: {},
  };

  const availState = {};
  DAYS.forEach((d) => {
    const wins = (e.availability && e.availability[d.key]) || [];
    availState[d.key] = wins.length ? wins.map((w) => ({ start: w.start, end: w.end })) : [{ start: '09:00', end: '17:00' }];
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>${isEdit ? 'Modifier l\'événement' : 'Nouveau type d\'événement'}</h3>
        <button class="close">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Nom de l'événement</label>
          <input type="text" id="ev-name" value="${esc(e.name)}" placeholder="p.ex. Découverte 30 min">
        </div>
        <div class="row-2">
          <div class="field">
            <label>Durée (heures)</label>
            <input type="number" id="ev-duration" value="${(e.duration/60).toFixed(1)}" min="0.5" step="0.5">
            <div class="hint">Ex. 1 = 1 heure, 0.5 = 30 min, 1.5 = 1h30.</div>
          </div>
          <div class="field">
            <label>Intervalle entre créneaux</label>
            <input type="number" id="ev-interval" value="${e.slot_interval || ''}" min="0" step="5" placeholder="= durée">
            <div class="hint">Laissez vide pour des créneaux d'affilée.</div>
          </div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea id="ev-desc">${esc(e.description)}</textarea>
        </div>
        <div class="row-2">
          <div class="field">
            <label>Lieu du rendez-vous</label>
            <select id="ev-loc">
              <option value="video" ${e.location_type === 'video' ? 'selected' : ''}>Visio (Zoom / Meet / Teams)</option>
              <option value="in_person" ${e.location_type === 'in_person' ? 'selected' : ''}>En personne</option>
              <option value="phone" ${e.location_type === 'phone' ? 'selected' : ''}>Téléphone</option>
              <option value="custom" ${e.location_type === 'custom' ? 'selected' : ''}>Autre</option>
            </select>
          </div>
          <div class="field">
            <label>Détail du lieu</label>
            <input type="text" id="ev-locdetail" value="${esc(e.location_detail)}" placeholder="p.ex. Lien envoyé par email">
          </div>
        </div>
        <div class="field">
          <label>Adresse du lieu de rendez-vous</label>
          <input type="text" id="ev-address" value="${esc(e.address)}" placeholder="ex. 12 avenue des Champs-Élysées, 75008 Paris">
          <div class="hint">Affiché au client au moment de la réservation (utile pour les RDV en personne).</div>
        </div>
        <div class="field">
          <label>Organisateur</label>
          <select id="ev-organizer">
            <option value="${esc(e.organizer)}">${esc(e.organizer || state.user.name)}</option>
          </select>
          <div class="hint" id="ev-organizer-hint">Chargement des organisateurs…</div>
        </div>
        <div class="row-2">
          <div class="field">
            <label>Tampon avant (min)</label>
            <input type="number" id="ev-bufferbefore" value="${e.buffer_before}" min="0" step="5">
          </div>
          <div class="field">
            <label>Tampon après (min)</label>
            <input type="number" id="ev-bufferafter" value="${e.buffer_after}" min="0" step="5">
          </div>
        </div>
        <div class="row-2">
          <div class="field">
            <label>Max de rendez-vous / jour</label>
            <input type="number" id="ev-limit" value="${e.daily_limit || ''}" min="0" placeholder="0 = illimité">
          </div>
          <div class="field">
            <label>Délai min. avant RDV (min)</label>
            <input type="number" id="ev-notice" value="${e.min_notice_minutes || ''}" min="0" step="5" placeholder="0 = aucun">
          </div>
        </div>
        <div class="field">
          <label>Couleur</label>
          <div class="color-picker" id="ev-colors">
            ${COLORS.map((c) => `<div class="c ${e.color === c ? 'selected' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}
          </div>
          <input type="hidden" id="ev-color" value="${e.color}">
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:10px;">
            <span class="toggle"><input type="checkbox" id="ev-active" ${e.is_active ? 'checked' : ''}></span>
            Événement actif (visible sur votre page)
          </label>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:8px 0 18px;">
        <h3 style="font-size:16px;margin-bottom:4px;">Questions pour l'invité (champs personnalisés)</h3>
        <p class="hint" style="font-size:13px;color:var(--muted);margin-bottom:14px;">Ajoutez des questions à poser à l'invité lors de la réservation (ex. Carte VTC, Numéro de téléphone...).</p>
        <div id="cf-editor"></div>
        <button class="btn btn-secondary btn-sm" id="cf-add" type="button" style="margin-top:8px;">+ Ajouter une question</button>

        <hr style="border:none;border-top:1px solid var(--border);margin:18px 0 18px;">
        <h3 style="font-size:16px;margin-bottom:4px;">Disponibilités hebdomadaires</h3>
        <p class="hint" style="font-size:13px;color:var(--muted);margin-bottom:14px;">Définissez les horaires où vous êtes disponible. Décochez un jour pour le rendre indisponible.</p>
        <div id="avail-editor"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-act="cancel">Annuler</button>
        <button class="btn btn-primary" data-act="save">${isEdit ? 'Enregistrer' : 'Créer l\'événement'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Organisateurs (moi + collègues de la même agence)
  (async () => {
    try {
      const orgs = await api('/api/events/organizers');
      const sel = $('#ev-organizer', overlay);
      const current = e.organizer || state.user.name;
      sel.innerHTML = orgs.map((o) => `<option value="${esc(o.name)}" ${o.name === current ? 'selected' : ''}>${esc(o.name)}${o.name === state.user.name ? ' (vous)' : ''}</option>`).join('');
      if (!$('#ev-organizer', overlay).value) { sel.innerHTML += `<option value="${esc(current)}" selected>${esc(current)}</option>`; }
      $('#ev-organizer-hint', overlay).textContent = 'La personne qui organise et anime ce rendez-vous.';
    } catch (_) {}
  })();

  // Couleurs
  $$('#ev-colors .c', overlay).forEach((c) => c.addEventListener('click', () => {
    $$('#ev-colors .c', overlay).forEach((x) => x.classList.remove('selected'));
    c.classList.add('selected');
    $('#ev-color', overlay).value = c.dataset.c;
  }));

  // Éditeur de champs personnalisés
  let customFields = (e.custom_fields || []).map((f) => ({ ...f }));
  const cfEditor = $('#cf-editor', overlay);
  function renderCustomFields() {
    cfEditor.innerHTML = customFields.map((f, i) => `
      <div class="avail-day" style="align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <input type="text" class="cf-label" value="${esc(f.label)}" placeholder="Libellé (ex. Carte VTC)" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
          <div style="display:flex;gap:6px;">
            <select class="cf-type" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;">
              <option value="text" ${f.type==='text'?'selected':''}>Texte</option>
              <option value="select" ${f.type==='select'?'selected':''}>Liste (choix)</option>
              <option value="yesno" ${f.type==='yesno'?'selected':''}>Oui / Non (bascule)</option>
              <option value="tel" ${f.type==='tel'?'selected':''}>Téléphone</option>
              <option value="number" ${f.type==='number'?'selected':''}>Nombre</option>
            </select>
            <label style="display:flex;align-items:center;gap:5px;font-size:13px;white-space:nowrap;">
              <input type="checkbox" class="cf-req" ${f.required?'checked':''}> Requis
            </label>
          </div>
          ${f.type==='select' ? `<input type="text" class="cf-options" value="${esc((f.options||[]).join(', '))}" placeholder="Options séparées par des virgules" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;margin-top:6px;font-size:13px;">` : ''}
        </div>
        <button class="rm cf-del" type="button" style="margin-top:4px;">&times;</button>
      </div>
    `).join('');
    cfEditor.querySelectorAll('.cf-type').forEach((sel, i) => {
      sel.addEventListener('change', () => {
        customFields[i].type = sel.value;
        renderCustomFields();
      });
    });
    cfEditor.querySelectorAll('.cf-label').forEach((inp, i) => inp.addEventListener('input', () => customFields[i].label = inp.value));
    cfEditor.querySelectorAll('.cf-req').forEach((cb, i) => cb.addEventListener('change', () => customFields[i].required = cb.checked));
    cfEditor.querySelectorAll('.cf-options').forEach((inp, i) => inp.addEventListener('input', () => customFields[i].options = inp.value.split(',').map(s=>s.trim()).filter(Boolean)));
    cfEditor.querySelectorAll('.cf-del').forEach((btn, i) => btn.addEventListener('click', () => { customFields.splice(i, 1); renderCustomFields(); }));
  }
  renderCustomFields();
  $('#cf-add', overlay).addEventListener('click', () => {
    customFields.push({ label: '', type: 'text', required: true, options: [] });
    renderCustomFields();
  });

  // Éditeur de disponibilités
  const editor = $('#avail-editor', overlay);
  function renderAvail() {
    editor.innerHTML = DAYS.map((d, i) => {
      const wins = availState[d.key];
      const enabled = wins.some((w) => w.start && w.end);
      return `
        <div class="avail-day" data-day="${d.key}">
          <div style="display:flex;align-items:center;gap:8px;width:90px;padding-top:2px;">
            <span class="toggle"><input type="checkbox" class="day-on" ${enabled ? 'checked' : ''}></span>
            <label class="day-label" style="padding-top:0;">${d.label}</label>
          </div>
          <div class="windows">
            ${wins.map((w, wi) => `
              <div class="avail-window">
                <input type="time" class="w-start" value="${w.start}" ${enabled ? '' : 'disabled'}>
                <span style="color:var(--muted)">à</span>
                <input type="time" class="w-end" value="${w.end}" ${enabled ? '' : 'disabled'}>
                <button class="rm" type="button" ${wins.length === 1 ? 'style="visibility:hidden"' : ''}>&times;</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });
    // événements
    editor.querySelectorAll('.avail-day').forEach((dayEl) => {
      const key = dayEl.dataset.day;
      const toggle = dayEl.querySelector('.day-on');
      const inputs = dayEl.querySelectorAll('input[type=time]');
      const setDisabled = (dis) => inputs.forEach((i) => { i.disabled = dis; if (dis) i.value = ''; else if (!i.value) i.value = i.classList.contains('w-start') ? '09:00' : '17:00'; });
      toggle.addEventListener('change', () => { setDisabled(!toggle.checked); if (toggle.checked && !availState[key].some(w=>w.start&&w.end)) { availState[key]=[{start:'09:00',end:'17:00'}]; renderAvail(); } });
      dayEl.querySelectorAll('.avail-window').forEach((wEl, wi) => {
        wEl.querySelector('.w-start').addEventListener('change', (e) => { availState[key][wi].start = e.target.value; });
        wEl.querySelector('.w-end').addEventListener('change', (e) => { availState[key][wi].end = e.target.value; });
        wEl.querySelector('.rm').addEventListener('click', () => {
          if (availState[key].length > 1) { availState[key].splice(wi, 1); renderAvail(); }
        });
      });
      if (!toggle.checked) setDisabled(true);
    });
  }
  renderAvail();

  // Fermer
  overlay.querySelector('.close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => overlay.remove());

  // Enregistrer
  overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const availability = {};
    DAYS.forEach((d) => {
      const wins = availState[d.key].filter((w) => w.start && w.end);
      if (wins.length) availability[d.key] = wins;
    });
    const payload = {
      name: $('#ev-name', overlay).value.trim(),
      duration: Math.round((parseFloat($('#ev-duration', overlay).value) || 1) * 60),
      slot_interval: parseInt($('#ev-interval', overlay).value, 10) || 0,
      description: $('#ev-desc', overlay).value.trim(),
      location_type: $('#ev-loc', overlay).value,
      location_detail: $('#ev-locdetail', overlay).value.trim(),
      address: $('#ev-address', overlay).value.trim(),
      organizer: $('#ev-organizer', overlay).value || state.user.name,
      buffer_before: parseInt($('#ev-bufferbefore', overlay).value, 10) || 0,
      buffer_after: parseInt($('#ev-bufferafter', overlay).value, 10) || 0,
      daily_limit: parseInt($('#ev-limit', overlay).value, 10) || 0,
      min_notice_minutes: parseInt($('#ev-notice', overlay).value, 10) || 0,
      color: $('#ev-color', overlay).value,
      is_active: $('#ev-active', overlay).checked,
      custom_fields: customFields.filter((f) => f.label && f.label.trim()),
      availability,
    };
    if (!payload.name) return toast('Le nom est requis');
    try {
      if (isEdit) await api(`/api/events/${existing.id}`, { method: 'PUT', body: payload });
      else await api('/api/events', { method: 'POST', body: payload });
      overlay.remove();
      toast(isEdit ? 'Événement mis à jour' : 'Événement créé');
      renderEvents();
    } catch (e) { toast(e.message); }
  });
}

// ============================ Bookings ============================
const bookingTabs = ['upcoming', 'past', 'cancelled'];
let bookingTab = 'upcoming';

async function renderBookings() {
  const content = $('#content');
  content.innerHTML = `
    <div class="tabs" id="bk-tabs">
      <button data-bt="upcoming" class="${bookingTab === 'upcoming' ? 'active' : ''}">À venir</button>
      <button data-bt="past" class="${bookingTab === 'past' ? 'active' : ''}">Passés</button>
      <button data-bt="cancelled" class="${bookingTab === 'cancelled' ? 'active' : ''}">Annulés</button>
    </div>
    <div id="bk-list"><div class="spinner"></div></div>
  `;
  $('#bk-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bt]');
    if (!btn) return;
    bookingTab = btn.dataset.bt;
    $$('#bk-tabs button').forEach((x) => x.classList.toggle('active', x === btn));
    loadBookings();
  });
  loadBookings();
}

async function loadBookings() {
  const list = $('#bk-list');
  try {
    const bookings = await api(`/api/bookings?status=${bookingTab}`);
    if (!bookings.length) {
      list.innerHTML = `<div class="card"><div class="empty"><div class="e-ico">📥</div><h3>Aucune réservation</h3><p>${bookingTab === 'upcoming' ? 'Partagez votre lien pour recevoir vos premières réservations.' : 'Rien ici pour le moment.'}</p></div></div>`;
      return;
    }
    list.innerHTML = bookings.map((b) => {
      const tz = state.user.timezone;
      const d = new Date(b.start_time);
      const isCancelled = b.status === 'cancelled';
      return `
        <div class="booking-row">
          <div class="b-left">
            <div class="b-date" style="${isCancelled ? 'opacity:.5' : ''}">
              <div class="d">${d.getUTCDate()}</div>
              <div class="m">${new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: tz }).format(d).replace('.','')}</div>
            </div>
            <div>
              <div class="b-name">${esc(b.invitee_name)} <span class="badge ${isCancelled ? 'badge-red' : b.start_time > new Date().toISOString() ? 'badge-green' : 'badge-gray'}" style="margin-left:4px;">${isCancelled ? 'Annulé' : b.start_time > new Date().toISOString() ? 'Confirmé' : 'Passé'}</span></div>
              <div class="b-time">${fmtDate(b.start_time, tz)} · ${fmtTime(b.start_time, tz)}–${fmtTime(b.end_time, tz)}</div>
              <div class="b-time">${esc(b.event.name)} · ${b.invitee_email}${b.invitee_notes ? ' · « ' + esc(b.invitee_notes) + ' »' : ''}</div>
              ${b.custom_answers && Object.keys(b.custom_answers).length ? `<div class="b-time" style="color:var(--blue);">` + Object.entries(b.custom_answers).map(([k,v])=>esc(k)+': '+esc(v)).join(' · ') + `</div>` : ''}
            </div>
          </div>
          ${!isCancelled && b.start_time > new Date().toISOString() ? `<button class="btn btn-danger btn-sm" data-cancel="${b.id}">Annuler</button>` : ''}
        </div>
      `;
    }).join('');
    $$('[data-cancel]', list).forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Annuler cette réservation ?')) return;
      await api(`/api/bookings/${btn.dataset.cancel}/cancel`, { method: 'POST' });
      toast('Réservation annulée');
      loadBookings();
    }));
  } catch (e) { list.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`; }
}

// ============================ Settings ============================
const TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto',
  'America/Sao_Paulo', 'Africa/Casablanca', 'Africa/Dakar', 'Africa/Lagos', 'Africa/Johannesburg',
  'Asia/Dubai', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'Pacific/Auckland',
  'UTC',
];

function renderSettings() {
  const u = state.user;
  const content = $('#content');
  content.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Mon profil</h2></div>
      <div class="card-body">
        <div class="field"><label>Nom complet</label><input type="text" id="s-name" value="${esc(u.name)}"></div>
        <div class="field"><label>Nom d'utilisateur</label><input type="text" id="s-username" value="${esc(u.username)}">
          <div class="hint">Votre page : <a id="s-preview" href="/${esc(u.username)}" target="_blank">/${esc(u.username)}</a></div></div>
        <div class="field"><label>Message de bienvenue</label>
          <textarea id="s-welcome" placeholder="ex. Bienvenue ! Choisissez un créneau pour votre rendez-vous.">${esc(u.welcome_message || '')}</textarea>
          <div class="hint">Affiché en haut de votre page de réservation.</div></div>
        <div class="row-2">
          <div class="field"><label>Langue</label>
            <select id="s-language">
              <option value="fr" ${u.language==='fr'?'selected':''}>Français</option>
              <option value="en" ${u.language==='en'?'selected':''}>English</option>
              <option value="es" ${u.language==='es'?'selected':''}>Español</option>
              <option value="it" ${u.language==='it'?'selected':''}>Italiano</option>
            </select></div>
          <div class="field"><label>Pays</label>
            <input type="text" id="s-country" value="${esc(u.country || 'France')}"></div>
        </div>
        <div class="row-2">
          <div class="field"><label>Format de la date</label>
            <select id="s-dateformat">
              <option value="DD/MM/YYYY" ${u.date_format==='DD/MM/YYYY'?'selected':''}>DD/MM/YYYY</option>
              <option value="MM/DD/YYYY" ${u.date_format==='MM/DD/YYYY'?'selected':''}>MM/DD/YYYY</option>
              <option value="YYYY-MM-DD" ${u.date_format==='YYYY-MM-DD'?'selected':''}>YYYY-MM-DD</option>
            </select></div>
          <div class="field"><label>Format de l'heure</label>
            <select id="s-timeformat">
              <option value="24h" ${u.time_format==='24h'?'selected':''}>24h</option>
              <option value="12h" ${u.time_format==='12h'?'selected':''}>12h (AM/PM)</option>
            </select></div>
        </div>
        <div class="field"><label>Fuseau horaire</label>
          <select id="s-tz">${TIMEZONES.map((tz) => `<option value="${tz}" ${tz === u.timezone ? 'selected' : ''}>${tz}</option>`).join('')}</select>
          <div class="hint">Heure actuelle : ${new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</div></div>
        <div class="field"><label>Couleur de marque</label>
          <div class="color-picker" id="s-colors">
            ${COLORS.map((c) => `<div class="c ${u.brand_color === c ? 'selected' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}
          </div>
          <input type="hidden" id="s-color" value="${u.brand_color}">
        </div>
        <button class="btn btn-primary" id="s-save">Enregistrer les modifications</button>
        <button class="btn btn-secondary" id="s-cancel">Annuler</button>
        <div class="error-msg" id="s-err"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Mot de passe</h2></div>
      <div class="card-body">
        <div class="field"><label>Mot de passe actuel</label><input type="password" id="p-current"></div>
        <div class="field"><label>Nouveau mot de passe</label><input type="password" id="p-new"></div>
        <button class="btn btn-secondary" id="p-save">Changer le mot de passe</button>
        <div class="error-msg" id="p-err"></div>
      </div>
    </div>
    <div class="card" style="border-color:#fecaca;">
      <div class="card-head"><h2 style="color:var(--red)">Zone dangereuse</h2></div>
      <div class="card-body">
        <p style="font-size:14px;color:var(--muted);margin-bottom:14px;">La suppression de votre compte est définitive et efface tous vos événements et rendez-vous.</p>
        <button class="btn btn-danger" id="s-delete">Supprimer le compte</button>
        <div class="error-msg" id="d-err"></div>
      </div>
    </div>
  `;

  let selColor = u.brand_color;
  $$('#s-colors .c', content).forEach((c) => c.addEventListener('click', () => {
    $$('#s-colors .c', content).forEach((x) => x.classList.remove('selected'));
    c.classList.add('selected');
    selColor = c.dataset.c;
    $('#s-color', content).value = selColor;
  }));
  $('#s-username').addEventListener('input', () => {
    $('#s-preview', content).textContent = '/' + ($('#s-username').value.toLowerCase().replace(/[^a-z0-9-_]/g, ''));
  });

  $('#s-save').addEventListener('click', async () => {
    const err = $('#s-err');
    err.textContent = '';
    try {
      const res = await api('/api/settings', { method: 'PUT', body: {
        name: $('#s-name').value, username: $('#s-username').value, timezone: $('#s-tz').value,
        brand_color: selColor, about: state.user.about || '',
        welcome_message: $('#s-welcome').value, language: $('#s-language').value,
        date_format: $('#s-dateformat').value, time_format: $('#s-timeformat').value,
        country: $('#s-country').value,
      }});
      state.user = { ...state.user, ...res };
      $('#user-name').textContent = res.name;
      $('#user-avatar').textContent = res.name.slice(0, 1).toUpperCase();
      $('#share-link').href = '/' + res.username;
      document.documentElement.style.setProperty('--blue', res.brand_color || '#0069ff');
      toast('Paramètres enregistrés');
    } catch (e) { err.textContent = e.message; }
  });

  $('#s-cancel').addEventListener('click', () => { renderSettings(); });

  $('#s-delete').addEventListener('click', async () => {
    if (!confirm('Voulez-vous vraiment supprimer définitivement votre compte et toutes vos données ?')) return;
    const d = $('#d-err');
    d.textContent = '';
    try {
      await api('/api/settings/account', { method: 'DELETE' });
      window.location.href = '/';
    } catch (e) { d.textContent = e.message; }
  });

  $('#p-save').addEventListener('click', async () => {
    const err = $('#p-err');
    err.textContent = '';
    err.className = 'error-msg';
    const btn = $('#p-save');
    const pw = $('#p-new').value;
    if (!pw || pw.length < 8) {
      err.textContent = 'Le nouveau mot de passe doit contenir au moins 8 caractères.';
      return;
    }
    btn.disabled = true;
    try {
      const data = await api('/api/settings/password', { method: 'PUT', body: {
        current_password: $('#p-current').value, new_password: pw,
      }});
      $('#p-current').value = ''; $('#p-new').value = '';
      err.className = 'success-msg';
      err.textContent = data.message || 'Mot de passe modifié avec succès !';
      toast(data.message || 'Mot de passe modifié');
    } catch (e) {
      err.textContent = e.message || 'Erreur lors du changement de mot de passe.';
      toast(e.message || 'Erreur');
    } finally {
      btn.disabled = false;
    }
  });
}

// ============================ Équipe & Agences (admin) ============================
let teamState = { users: [], agencies: [] };

async function renderTeam() {
  if (state.user.role !== 'admin') {
    $('#content').innerHTML = `<div class="card"><div class="empty"><h3>Accès réservé aux administrateurs</h3></div></div>`;
    return;
  }
  const content = $('#content');
  content.innerHTML = `<div class="spinner"></div>`;
  try {
    const [users, agencies, siteSettings] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/agencies'),
      api('/api/admin/site-settings'),
    ]);
    teamState = { users, agencies };
    state.siteName = siteSettings.site_name;
    state.siteLogo = siteSettings.logo;
    state.registration_enabled = siteSettings.registration_enabled;

    const agencyCards = agencies.map((a) => `
      <div class="event-row" style="cursor:default;">
        <div class="left">
          <div class="colorbar" style="background:${esc(a.brand_color||'#8b5cf6')}"></div>
          <div>
            <div class="e-name">${esc(a.name)}</div>
            <div class="e-meta">${a.members} membre(s) · <a href="${esc(a.landing_url)}" target="_blank" onclick="event.stopPropagation()">https://elutetia-agenda.fr${esc(a.landing_url)}</a></div>
          </div>
        </div>
        <div class="e-actions">
          <button class="btn btn-secondary btn-sm" data-agency-view="${a.id}">Page</button>
          <button class="btn btn-secondary btn-sm" data-agency-edit="${a.id}">Modifier</button>
          <button class="btn btn-danger btn-sm" data-agency-del="${a.id}">Supprimer</button>
        </div>
      </div>
    `).join('');

    const userRows = teamState.users.map((u) => `
      <div class="event-row" style="cursor:default;">
        <div class="left">
          <div class="colorbar" style="background:${u.role === 'admin' ? '#f59e0b' : u.agency_name ? '#16a34a' : '#71717a'}"></div>
          <div>
            <div class="e-name">${esc(u.name)} ${u.role === 'admin' ? '<span class="badge badge-gray">Admin</span>' : '<span class="badge badge-green">Membre</span>'}</div>
            <div class="e-meta">${esc(u.email)} · @${esc(u.username)} · ${esc(u.agency_name || 'Aucune agence')}</div>
            <div class="e-meta">${u.events_count} événement(s) · ${u.bookings_count} réservation(s)</div>
          </div>
        </div>
        <div class="e-actions">
          <button class="btn btn-secondary btn-sm" data-user-edit="${u.id}">Modifier</button>
          ${u.id !== state.user.id ? `<button class="btn btn-danger btn-sm" data-user-del="${u.id}">Supprimer</button>` : ''}
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Paramètres du site</h2></div>
        <div class="card-body">
          <div class="field"><label>Nom du site</label><input type="text" id="ss-name" value="${esc(state.siteName || 'E-Lutetia Agenda')}"></div>
          <div class="field"><label>Logo de la société (URL)</label>
            <input type="text" id="ss-logo" value="${esc(state.siteLogo || '')}" placeholder="https://.../logo.png">
            <div class="hint">Collez l'adresse (URL) de votre logo, ou laissez vide pour utiliser l'icône par défaut.</div>
            ${state.siteLogo ? `<img src="${esc(state.siteLogo)}" style="max-height:50px;margin-top:8px;border-radius:8px;" alt="logo">` : ''}
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:10px;">
              <span class="toggle"><input type="checkbox" id="ss-reg" ${state.registration_enabled !== false ? 'checked' : ''}></span>
              Autoriser l'inscription de nouveaux comptes sur le site
            </label>
            <div class="hint">Désactivez pour empêcher toute personne de créer un compte. Seuls les administrateurs pourront ajouter des membres.</div>
          </div>
          <button class="btn btn-primary" id="ss-save">Enregistrer</button>
          <div class="error-msg" id="ss-err"></div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px;">
        <button class="btn btn-secondary" id="add-agency">+ Nouvelle agence</button>
        <button class="btn btn-primary" id="add-user">+ Ajouter un membre</button>
      </div>

      <div class="card">
        <div class="card-head"><h2>Agences</h2></div>
        ${agencies.length ? agencyCards : `<div class="empty"><h3>Aucune agence</h3><p>Créez vos agences (Paris, Nice...).</p></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h2>Membres</h2></div>
        ${userRows}
      </div>
    `;

    // Réglages du site
    $('#ss-save').addEventListener('click', async () => {
      const err = $('#ss-err'); err.textContent='';
      try {
        await api('/api/admin/site-settings', { method: 'PUT', body: {
          site_name: $('#ss-name').value,
          logo: $('#ss-logo').value.trim(),
          registration_enabled: $('#ss-reg').checked,
        }});
        state.siteName = $('#ss-name').value;
        state.siteLogo = $('#ss-logo').value.trim();
        state.registration_enabled = $('#ss-reg').checked;
        toast('Paramètres du site enregistrés');
        renderTeam();
      } catch(e){ err.textContent = e.message; }
    });

    // Boutons
    $('#add-agency').addEventListener('click', addAgencyModal);
    $('#add-user').addEventListener('click', addUserModal);
    $$('[data-agency-view]').forEach((b) => b.addEventListener('click', () => {
      const a = teamState.agencies.find((x) => String(x.id) === String(b.dataset.agencyView));
      if (a) window.open(a.landing_url, '_blank');
    }));
    $$('[data-agency-edit]').forEach((b) => b.addEventListener('click', () => editAgencyModal(b.dataset.agencyEdit)));
    $$('[data-agency-del]').forEach((b) => b.addEventListener('click', () => delAgency(b.dataset.agencyDel)));
    $$('[data-user-edit]').forEach((b) => b.addEventListener('click', () => editUserModal(b.dataset.userEdit)));
    $$('[data-user-del]').forEach((b) => b.addEventListener('click', () => delUser(b.dataset.userDel)));
  } catch (e) {
    content.innerHTML = `<div class="card"><div class="error-msg" style="padding:20px">${esc(e.message)}</div></div>`;
  }
}

function agencySelectOptions(selected) {
  return teamState.agencies.map((a) => `<option value="${a.id}" ${Number(selected) === Number(a.id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}

function addAgencyModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Nouvelle agence</h3><button class="close">×</button></div>
      <div class="modal-body">
        <div class="field"><label>Nom de l'agence</label><input type="text" id="ag-name" placeholder="ex. E-Lutetia Paris"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-act="cancel">Annuler</button>
        <button class="btn btn-primary" data-act="save">Créer l'agence</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const name = $('#ag-name', overlay).value.trim();
    if (!name) return toast('Nom requis');
    await api('/api/admin/agencies', { method: 'POST', body: { name } });
    overlay.remove(); toast('Agence créée'); renderTeam();
  });
}

function editAgencyModal(id) {
  const a = teamState.agencies.find((x) => String(x.id) === String(id));
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Modifier l'agence</h3><button class="close">×</button></div>
      <div class="modal-body">
        <div class="field"><label>Nom de l'agence</label><input type="text" id="ag-name" value="${esc(a.name)}"></div>
        <div class="field"><label>Description</label><textarea id="ag-desc">${esc(a.description||'')}</textarea></div>
        <div class="field"><label>Adresse</label><input type="text" id="ag-address" value="${esc(a.address||'')}" placeholder="ex. 12 avenue des Champs-Élysées, 75008 Paris"></div>
        <div class="row-2">
          <div class="field"><label>Téléphone</label><input type="text" id="ag-phone" value="${esc(a.phone||'')}"></div>
          <div class="field"><label>Email</label><input type="text" id="ag-email" value="${esc(a.email||'')}"></div>
        </div>
        <div class="field"><label>Page publique</label>
          <div class="hint"><a href="${esc(a.landing_url)}" target="_blank">https://elutetia-agenda.fr${esc(a.landing_url)}</a> — vos clients verront ceci.</div></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-act="cancel">Annuler</button>
        <button class="btn btn-primary" data-act="save">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const name = $('#ag-name', overlay).value.trim();
    if (!name) return toast('Nom requis');
    try {
      await api(`/api/admin/agencies/${id}`, { method: 'PUT', body: {
        name,
        description: $('#ag-desc', overlay).value,
        address: $('#ag-address', overlay).value,
        phone: $('#ag-phone', overlay).value,
        email: $('#ag-email', overlay).value,
      }});
      overlay.remove(); toast('Agence mise à jour'); renderTeam();
    } catch (e) { toast(e.message); }
  });
}

async function delAgency(id) {
  const a = teamState.agencies.find((x) => String(x.id) === String(id));
  if (!confirm(`Supprimer l'agence « ${a.name} » ? Les membres ne seront plus rattachés.`)) return;
  await api(`/api/admin/agencies/${id}`, { method: 'DELETE' });
  toast('Agence supprimée'); renderTeam();
}

function addUserModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Ajouter un membre</h3><button class="close">×</button></div>
      <div class="modal-body">
        <div class="field"><label>Nom complet</label><input type="text" id="u-name"></div>
        <div class="field"><label>Email</label><input type="email" id="u-email"></div>
        <div class="field"><label>Mot de passe (8 caractères min.)</label><input type="text" id="u-pass"></div>
        <div class="field"><label>Agence</label><select id="u-agency"><option value="">Aucune</option>${agencySelectOptions()}</select></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-act="cancel">Annuler</button>
        <button class="btn btn-primary" data-act="save">Créer le compte</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const name = $('#u-name', overlay).value.trim();
    const email = $('#u-email', overlay).value.trim();
    const password = $('#u-pass', overlay).value;
    const agency_id = $('#u-agency', overlay).value;
    if (!name || !email || !password) return toast('Nom, email et mot de passe requis');
    try {
      await api('/api/admin/users', { method: 'POST', body: { name, email, password, agency_id: agency_id || null } });
      overlay.remove(); toast('Compte créé'); renderTeam();
    } catch (e) { toast(e.message); }
  });
}

function editUserModal(id) {
  const u = teamState.users.find((x) => String(x.id) === String(id));
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Modifier ${esc(u.name)}</h3><button class="close">×</button></div>
      <div class="modal-body">
        <div class="field"><label>Nom</label><input type="text" id="u-name" value="${esc(u.name)}"></div>
        <div class="field"><label>Agence</label><select id="u-agency"><option value="">Aucune</option>${agencySelectOptions(u.agency_id)}</select></div>
        <div class="field"><label>Rôle</label>
          <select id="u-role">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Membre</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrateur</option>
          </select>
        </div>
        <div class="field"><label>Nouveau mot de passe (laisser vide pour ne pas changer)</label><input type="text" id="u-pass" placeholder="min. 8 caractères"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-act="cancel">Annuler</button>
        <button class="btn btn-primary" data-act="save">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const body = {
      name: $('#u-name', overlay).value.trim(),
      agency_id: $('#u-agency', overlay).value || null,
      role: $('#u-role', overlay).value,
    };
    const pw = $('#u-pass', overlay).value;
    if (pw) body.password = pw;
    try {
      await api(`/api/admin/users/${id}`, { method: 'PUT', body });
      overlay.remove(); toast('Modifications enregistrées'); renderTeam();
    } catch (e) { toast(e.message); }
  });
}

async function delUser(id) {
  const u = teamState.users.find((x) => String(x.id) === String(id));
  if (!confirm(`Supprimer le compte de « ${u.name} » et toutes ses données ?`)) return;
  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    toast('Compte supprimé'); renderTeam();
  } catch (e) { toast(e.message); }
}

// ============================ Liens & Sondages ============================
async function renderLinks() {
  const content = $('#content');
  content.innerHTML = `<div class="spinner"></div>`;
  try {
    const [links, polls, events] = await Promise.all([
      api('/api/scheduling/single-use-links'),
      api('/api/scheduling/polls'),
      api('/api/events'),
    ]);
    const eventOpts = events.map(e => `<option value="${e.id}">${esc(e.name)} (${fmtDuration(e.duration)})</option>`).join('');

    const linkRows = links.map(l => `
      <div class="event-row" style="cursor:default;">
        <div class="left">
          <div class="colorbar" style="background:${l.used?'#d4d4d8':'#16a34a'}"></div>
          <div>
            <div class="e-name">${esc(l.event_name)} ${l.used?'<span class="badge badge-gray">Utilisé</span>':'<span class="badge badge-green">Actif</span>'}</div>
            <div class="e-meta"><a href="${l.url}" target="_blank" onclick="event.stopPropagation()">https://elutetia-agenda.fr${l.url}</a></div>
          </div>
        </div>
        <div class="e-actions">
          <button class="btn btn-secondary btn-sm" data-copy="${l.url}">Copier</button>
          <button class="btn btn-danger btn-sm" data-link-del="${l.id}">Supprimer</button>
        </div>
      </div>`).join('');

    const pollRows = polls.map(p => `
      <div class="event-row" style="cursor:default;">
        <div class="left">
          <div class="colorbar" style="background:#8b5cf6"></div>
          <div>
            <div class="e-name">${esc(p.title)}</div>
            <div class="e-meta">${esc(p.event_name)} · ${p.slots.length} créneau(x) · <a href="${p.url}" target="_blank" onclick="event.stopPropagation()">https://elutetia-agenda.fr${p.url}</a></div>
          </div>
        </div>
        <div class="e-actions"><button class="btn btn-secondary btn-sm" data-copy="${p.url}">Copier</button>
          <button class="btn btn-danger btn-sm" data-poll-del="${p.id}">Supprimer</button></div>
      </div>`).join('');

    content.innerHTML = `
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px;">
        <button class="btn btn-secondary" id="new-link">+ Lien à usage unique</button>
        <button class="btn btn-primary" id="new-poll">+ Sondage de réunion</button>
      </div>
      <div class="card"><div class="card-head"><h2>Liens à usage unique</h2></div>
        ${linkRows ? linkRows : '<div class="empty"><h3>Aucun lien</h3><p>Un lien à usage unique permet à un invité de réserver une seule fois.</p></div>'}</div>
      <div class="card"><div class="card-head"><h2>Sondages de réunion</h2></div>
        ${pollRows ? pollRows : '<div class="empty"><h3>Aucun sondage</h3><p>Proposez plusieurs créneaux à vos invités pour choisir le meilleur.</p></div>'}</div>
    `;

    $('#new-link').addEventListener('click', () => {
      if (!events.length) return toast('Créez d\'abord un type d\'événement');
      const overlay = document.createElement('div'); overlay.className='modal-overlay';
      overlay.innerHTML = `<div class="modal"><div class="modal-head"><h3>Lien à usage unique</h3><button class="close">×</button></div>
        <div class="modal-body"><div class="field"><label>Type d'événement</label><select id="l-event">${eventOpts}</select></div>
        <p style="font-size:13px;color:var(--muted)">Ce lien fonctionnera pour UNE seule réservation.</p></div>
        <div class="modal-foot"><button class="btn btn-secondary" data-act="cancel">Annuler</button><button class="btn btn-primary" data-act="save">Créer le lien</button></div></div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.close').addEventListener('click',()=>overlay.remove());
      overlay.querySelector('[data-act="cancel"]').addEventListener('click',()=>overlay.remove());
      overlay.querySelector('[data-act="save"]').addEventListener('click', async ()=>{
        const r = await api('/api/scheduling/single-use-links',{method:'POST',body:{event_type_id:$('#l-event',overlay).value}});
        overlay.remove(); toast('Lien créé'); renderLinks();
      });
    });

    $('#new-poll').addEventListener('click', () => {
      if (!events.length) return toast('Créez d\'abord un type d\'événement');
      const overlay = document.createElement('div'); overlay.className='modal-overlay';
      overlay.innerHTML = `<div class="modal"><div class="modal-head"><h3>Sondage de réunion</h3><button class="close">×</button></div>
        <div class="modal-body">
          <div class="field"><label>Titre</label><input type="text" id="po-title" placeholder="ex. Choix de créneau"></div>
          <div class="field"><label>Type d'événement</label><select id="po-event">${eventOpts}</select></div>
          <div class="field"><label>Créneaux proposés</label><div id="po-slots"></div>
          <button class="btn btn-secondary btn-sm" id="po-add" style="margin-top:8px;">+ Ajouter un créneau</button></div>
        </div>
        <div class="modal-foot"><button class="btn btn-secondary" data-act="cancel">Annuler</button><button class="btn btn-primary" data-act="save">Créer le sondage</button></div></div>`;
      document.body.appendChild(overlay);
      const slotsBox = overlay.querySelector('#po-slots');
      function addSlotRow(start, end){
        const row=document.createElement('div'); row.className='avail-window'; row.style.marginBottom='8px';
        row.innerHTML=`<input type="datetime-local" class="ps-start" value="${start||''}"><input type="datetime-local" class="ps-end" value="${end||''}"><button class="rm" type="button">×</button>`;
        row.querySelector('.rm').addEventListener('click',()=>row.remove());
        slotsBox.appendChild(row);
      }
      addSlotRow(); addSlotRow();
      overlay.querySelector('#po-add').addEventListener('click',()=>addSlotRow());
      overlay.querySelector('.close').addEventListener('click',()=>overlay.remove());
      overlay.querySelector('[data-act="cancel"]').addEventListener('click',()=>overlay.remove());
      overlay.querySelector('[data-act="save"]').addEventListener('click', async ()=>{
        const slots=[];
        overlay.querySelectorAll('.ps-start').forEach((el,i)=>{
          const s=el.value, e=overlay.querySelectorAll('.ps-end')[i].value;
          if(s&&e) slots.push({start:s,end:e});
        });
        if(!slots.length) return toast('Ajoutez au moins un créneau');
        await api('/api/scheduling/polls',{method:'POST',body:{title:$('#po-title',overlay).value,event_type_id:$('#po-event',overlay).value,slots}});
        overlay.remove(); toast('Sondage créé'); renderLinks();
      });
    });

    // copier
    $$('[data-copy]').forEach(b=>b.addEventListener('click',()=>{
      const url='https://elutetia-agenda.fr'+b.dataset.copy;
      navigator.clipboard.writeText(url); toast('Lien copié');
    }));
    $$('[data-link-del]').forEach(b=>b.addEventListener('click',async()=>{
      await api(`/api/scheduling/single-use-links/${b.dataset.linkDel}`,{method:'DELETE'}); toast('Lien supprimé'); renderLinks();
    }));
    $$('[data-poll-del]').forEach(b=>b.addEventListener('click',async()=>{
      await api(`/api/scheduling/polls/${b.dataset.pollDel}`,{method:'DELETE'}); toast('Sondage supprimé'); renderLinks();
    }));
  } catch(e){ content.innerHTML=`<div class="card"><div class="error-msg" style="padding:20px">${esc(e.message)}</div></div>`; }
}

// ============================ Disponibilité avancée ============================
async function renderAvailability() {
  const content = $('#content');
  content.innerHTML = `<div class="spinner"></div>`;
  try {
    const holidays = await api('/api/settings/holidays-list');
    const me = await api('/api/auth/me');
    const user = me.user;
    const currentHolidays = user.holidays || [];
    const currentMax = user.max_daily_meetings || 0;

    // Toggle jour férié
    const holidayToggle = (d, label) => `<div class="avail-day" style="align-items:center;">
      <span class="toggle"><input type="checkbox" class="holiday-check" data-date="${d}" ${currentHolidays.includes(d)?'checked':''}></span>
      <label style="font-weight:600;">${label}</label><span style="color:var(--muted);font-size:13px;">${d}</span></div>`;

    content.innerHTML = `
      <div class="card"><div class="card-head"><h2>Limites de réunions</h2></div>
        <div class="card-body">
          <div class="field"><label>Nombre maximal de rendez-vous par jour</label>
            <input type="number" id="max-daily" min="0" value="${currentMax}" placeholder="0 = illimité">
            <div class="hint">Au-delà de ce nombre, les créneaux du jour deviennent indisponibles. 0 = illimité.</div></div>
          <button class="btn btn-primary" id="save-limit">Enregistrer la limite</button>
          <div class="error-msg" id="limit-err"></div>
        </div></div>
      <div class="card"><div class="card-head"><h2>Jours fériés (France)</h2></div>
        <div class="card-body">
          <p style="font-size:14px;color:var(--muted);margin-bottom:14px;">Les jours cochés seront automatiquement indisponibles pour toutes vos réservations.</p>
          <div id="holiday-list">
            ${holidays.map(d => holidayToggle(d, new Date(d+'T00:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}))).join('')}
          </div>
          <button class="btn btn-primary" id="save-holidays" style="margin-top:14px;">Enregistrer les jours fériés</button>
          <div class="error-msg" id="holiday-err"></div>
        </div></div>
    `;

    $('#save-limit').addEventListener('click', async ()=>{
      const err=$('#limit-err'); err.textContent='';
      try{
        const val = $('#max-daily').value;
        const holidays = user.holidays || [];
        await api('/api/settings',{method:'PUT',body:{max_daily_meetings:val, holidays}});
        state.user.max_daily_meetings = val;
        toast('Limite enregistrée');
      }catch(e){ err.textContent=e.message; }
    });

    $('#save-holidays').addEventListener('click', async ()=>{
      const err=$('#holiday-err'); err.textContent='';
      const selected = $$('.holiday-check:checked').map(c=>c.dataset.date);
      try{
        await api('/api/settings',{method:'PUT',body:{holidays:selected, max_daily_meetings:user.max_daily_meetings||0}});
        toast('Jours fériés enregistrés');
      }catch(e){ err.textContent=e.message; }
    });
  } catch(e){ content.innerHTML=`<div class="card"><div class="error-msg" style="padding:20px">${esc(e.message)}</div></div>`; }
}
