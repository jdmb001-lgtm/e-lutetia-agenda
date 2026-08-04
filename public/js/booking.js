// ============================================================
// E-Lutetia Agenda — Page publique de réservation
// ============================================================
const $ = (s, r = document) => r.querySelector(s);

const DOW = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function getUserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
}

const TZ = getUserTimezone();

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
  return data;
}

function pad(n) { return String(n).padStart(2, '0'); }
function isoDate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

// Format d'un créneau ISO UTC dans le fuseau de l'invité
function fmtSlotTime(iso) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
  } catch (_) {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}
function fmtDur(mins) {
  mins = Number(mins) || 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h${m < 10 ? '0' : ''}${m}`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}
function fmtLongDate(iso) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
  } catch (_) {
    return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}

// ---------------- État ----------------
const S = {
  event: null,
  viewYear: null,
  viewMonth: null, // 1-12
  overview: {},
  selectedDate: null, // 'YYYY-MM-DD'
  slots: [],
  selectedSlot: null,
  step: 1, // 1=calendrier, 2=créneaux, 3=formulaire, 4=confirmation
};

const card = $('#bk-card');

// ---------------- Initialisation ----------------
(async function init() {
  const path = location.pathname.split('/').filter(Boolean); // [username, slug]
  if (path.length < 2) { showError('Lien invalide.'); return; }
  const [username, slug] = path;

  try {
    const event = await api(`/api/public/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`);
    S.event = event;
    // Colorer la marque
    document.documentElement.style.setProperty('--blue', event.color || '#0069ff');
    document.title = `${event.name} — ${event.host.name}`;
    // Mois par défaut : mois courant
    const now = new Date();
    S.viewYear = now.getFullYear();
    S.viewMonth = now.getMonth() + 1;
    renderShell();
    await loadMonth();
  } catch (e) {
    showError(e.message || 'Événement introuvable.');
  }
})();

function renderShell() {
  const e = S.event;
  const hostInitial = e.host.name.trim().slice(0, 1).toUpperCase() || '?';
  card.innerHTML = `
    <div class="bk-left">
      <div>
        <div class="bk-host-avatar" style="background:${e.color || '#0069ff'}">${hostInitial}</div>
        <h1>${escapeHtml(e.name)}</h1>
        <div class="bk-host">avec ${escapeHtml(e.organizer || e.host.name)}</div>
        ${e.host.welcome_message ? `<div class="bk-desc">${escapeHtml(e.host.welcome_message)}</div>` : ''}
        ${e.description ? `<div class="bk-desc">${escapeHtml(e.description)}</div>` : ''}
        <div class="bk-meta">
          <div><span class="m-ico">⏱️</span> ${fmtDur(e.duration)}</div>
          <div><span class="m-ico">📍</span> ${escapeHtml(locLabel(e.location_type))}${e.location_detail ? ' · ' + escapeHtml(e.location_detail) : ''}</div>
          ${e.address ? `<div><span class="m-ico">🏢</span> ${escapeHtml(e.address)}</div>` : ''}
          <div><span class="m-ico">🕒</span> Fuseau : ${escapeHtml(e.host.timezone)}</div>
        </div>
      </div>
      <div style="color:var(--muted);font-size:12px;">Powered by E-Lutetia Agenda</div>
    </div>
    <div class="bk-right" id="bk-right"></div>
  `;
}

function locLabel(t) {
  return { video: 'Visio', in_person: 'En personne', phone: 'Téléphone', custom: 'Lieu personnalisé' }[t] || t;
}

// ---------------- Mois / calendrier ----------------
function pathParts() {
  return location.pathname.split('/').filter(Boolean); // [username, slug]
}

async function loadMonth() {
  const p = pathParts();
  const res = await api(`/api/public/${p[0]}/${p[1]}/month?year=${S.viewYear}&month=${S.viewMonth}`);
  S.overview = res;
  renderStep(1);
}

function buildCalendar() {
  const { viewYear: y, viewMonth: m } = S;
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=dim
  const offset = (firstDow + 6) % 7; // lundi en premier
  const daysInMonth = new Date(y, m, 0).getDate();

  let cells = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += `<div class="cal-day disabled"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const key = isoDate(y, m, d);
    const info = S.overview[key] || { count: 0 };
    const isToday = key === isoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const isSel = key === S.selectedDate;
    if (info.count > 0) {
      cells += `<div class="cal-day available ${isSel ? 'selected' : ''}" data-date="${key}" title="${info.count} créneau${info.count > 1 ? 'x' : ''}">
        ${d}<div class="slot-count">${info.count} ${isToday ? '· aujourd\'hui' : ''}</div></div>`;
    } else {
      cells += `<div class="cal-day disabled">${d}</div>`;
    }
  }
  return cells;
}

// ---------------- Rendu des étapes ----------------
function renderStep(step) {
  S.step = step;
  const right = $('#bk-right');
  const e = S.event;

  const dots = `<div class="step-dots">
    ${[1, 2, 3].map((i) => `<span class="dot ${i === step ? 'active' : ''}"></span>`).join('')}
  </div>`;

  if (step === 1) {
    const mTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(S.viewYear, S.viewMonth - 1, 1));
    right.innerHTML = `
      ${dots}
      <div class="bk-step">
        <h2>Sélectionnez une date</h2>
        <div class="cal-nav">
          <button id="prev-m" ${isMonthPast() ? 'disabled' : ''}>‹</button>
          <div class="month-title" style="text-transform:capitalize;">${mTitle}</div>
          <button id="next-m">›</button>
        </div>
        <div class="cal-grid">${buildCalendar()}</div>
      </div>
      <div class="bk-footer"><div></div></div>
    `;
    $('#prev-m').addEventListener('click', () => { S.viewMonth--; if (S.viewMonth < 1) { S.viewMonth = 12; S.viewYear--; } loadMonth(); });
    $('#next-m').addEventListener('click', () => { S.viewMonth++; if (S.viewMonth > 12) { S.viewMonth = 1; S.viewYear++; } loadMonth(); });
    $$('.cal-day.available').forEach((c) => c.addEventListener('click', async () => {
      S.selectedDate = c.dataset.date;
      // rafraîchir le calendrier pour surligner, puis charger les créneaux
      renderStep(1);
      const key = S.selectedDate;
      // charger les créneaux
      const path = location.pathname.split('/').filter(Boolean);
      const res = await api(`/api/public/${path[0]}/${path[1]}/day?date=${S.selectedDate}`);
      S.slots = res.slots;
      if (key !== S.selectedDate) return; // changement pendant le chargement
      renderStep(2);
    }));
  } else if (step === 2) {
    right.innerHTML = `
      ${dots}
      <div class="bk-step">
        <h2 style="font-size:16px;color:var(--muted);margin-bottom:4px;">${fmtLongDate(S.selectedDate + 'T12:00:00')}</h2>
        <h2>Sélectionnez une heure</h2>
        <div class="slots" style="margin-top:16px;">
          ${S.slots.length ? S.slots.map((s) => `<button class="slot-btn" data-start="${s.start}">${fmtSlotTime(s.start)}</button>`).join('')
            : '<p style="color:var(--muted)">Plus de créneau disponible ce jour-là.</p>'}
        </div>
      </div>
      <div class="bk-footer">
        <button class="back" id="back-step1">← Revenir</button>
        ${S.slots.length ? '<div></div>' : ''}
      </div>
    `;
    $('#back-step1').addEventListener('click', () => { S.selectedDate = null; S.slots = []; loadMonth(); });
    $$('.slot-btn').forEach((b) => b.addEventListener('click', () => {
      S.selectedSlot = b.dataset.start;
      $$('.slot-btn').forEach((x) => x.classList.toggle('selected', x === b));
      // petit délai visuel puis formulaire
      setTimeout(() => renderStep(3), 200);
    }));
  } else if (step === 3) {
    right.innerHTML = `
      ${dots}
      <div class="bk-step">
        <div style="background:var(--bg-soft);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:18px;">
          <div style="font-weight:700;">${fmtSlotTime(S.selectedSlot)} · ${fmtDur(e.duration)}</div>
          <div style="color:var(--muted);font-size:14px;">${fmtLongDate(S.selectedSlot)}</div>
        </div>
        <form class="bk-form" id="bk-form">
          <label>Votre nom *</label>
          <input type="text" id="invitee-name" required>
          <label>Votre email *</label>
          <input type="email" id="invitee-email" required>
          <div id="custom-fields"></div>
          <label>Notes (facultatif)</label>
          <textarea id="invitee-notes" rows="3"></textarea>
          <div class="tz-note">🌍 Les horaires sont affichés dans votre fuseau : ${TZ}</div>
          <div class="error-msg" id="bk-err"></div>
        </form>
      </div>
      <div class="bk-footer">
        <button class="back" id="back-step2">← Revenir</button>
        <button class="btn btn-primary" id="confirm-btn">Confirmer le rendez-vous</button>
      </div>
    `;
    $('#back-step2').addEventListener('click', () => renderStep(2));
    $('#confirm-btn').addEventListener('click', confirmBooking);
    $('#bk-form').addEventListener('submit', (e) => { e.preventDefault(); confirmBooking(); });
    renderCustomFields();
  } else if (step === 4) {
    right.innerHTML = `
      <div class="bk-success">
        <div class="check">✓</div>
        <h2>C'est confirmé !</h2>
        <div class="bk-when">${fmtLongDate(S.selectedSlot)}</div>
        <div style="font-size:16px;font-weight:600;">${fmtSlotTime(S.selectedSlot)} · ${fmtDur(e.duration)}</div>
        <p>${escapeHtml(S.event.host.name)} a bien reçu votre demande de rendez-vous.<br>
        Un email de confirmation vous a été envoyé à <strong>${escapeHtml(S.inviteeEmail || 'votre adresse')}</strong>.</p>
        <button class="btn btn-secondary" id="new-booking">Réserver un autre créneau</button>
      </div>
    `;
    $('#new-booking').addEventListener('click', () => {
      S.selectedDate = null; S.slots = []; S.selectedSlot = null; S.step = 1;
      const now = new Date(); S.viewYear = now.getFullYear(); S.viewMonth = now.getMonth() + 1;
      loadMonth();
    });
  }
}

function isMonthPast() {
  const now = new Date();
  return S.viewYear < now.getFullYear() || (S.viewYear === now.getFullYear() && S.viewMonth < now.getMonth() + 1);
}

function renderCustomFields() {
  const box = $('#custom-fields');
  if (!box) return;
  const fields = S.event.custom_fields || [];
  box.innerHTML = fields.map((f, i) => {
    const req = f.required ? ' *' : '';
    const id = `cf-${i}`;
    let input = '';
    if (f.type === 'select') {
      const opts = (f.options || []).map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
      input = `<select id="${id}" ${f.required ? 'required' : ''}><option value="">Sélectionnez...</option>${opts}</select>`;
    } else if (f.type === 'yesno') {
      // Bascule Oui / Non
      input = `<div class="yesno-toggle" data-target="${id}">
        <button type="button" class="yn-btn yn-yes" data-val="Oui">Oui</button>
        <button type="button" class="yn-btn yn-no" data-val="Non">Non</button>
        <input type="hidden" id="${id}" value="" ${f.required ? 'required' : ''}>
      </div>`;
    } else {
      input = `<input type="${f.type || 'text'}" id="${id}" ${f.required ? 'required' : ''}>`;
    }
    return `<label for="${id}">${escapeHtml(f.label)}${req}</label>${input}`;
  }).join('');

  // Activer les bascules Oui/Non
  box.querySelectorAll('.yesno-toggle').forEach((toggle) => {
    const hidden = toggle.querySelector('input[type=hidden]');
    const setVal = (v) => {
      hidden.value = v;
      toggle.querySelectorAll('.yn-btn').forEach((b) => b.classList.toggle('active', b.dataset.val === v));
    };
    toggle.querySelectorAll('.yn-btn').forEach((b) => b.addEventListener('click', () => {
      setVal(b.dataset.val);
      // valider le champ requis pour le formulaire
      if (hidden.required) hidden.setCustomValidity('');
    }));
  });
}

async function confirmBooking() {
  const name = $('#invitee-name').value.trim();
  const email = $('#invitee-email').value.trim();
  const notes = $('#invitee-notes').value.trim();
  const err = $('#bk-err');
  err.textContent = '';
  if (!name || !email) { err.textContent = 'Veuillez renseigner votre nom et votre email.'; return; }

  // Récupérer les réponses aux champs personnalisés
  const custom_answers = {};
  (S.event.custom_fields || []).forEach((f, i) => {
    const el = document.getElementById(`cf-${i}`);
    if (el) custom_answers[f.label] = el.value.trim();
  });

  const btn = $('#confirm-btn');
  btn.disabled = true; btn.textContent = 'Réservation en cours…';
  const path = location.pathname.split('/').filter(Boolean);
  try {
    const { booking } = await api(`/api/public/${path[0]}/${path[1]}/book`, { method: 'POST', body: {
      name, email, notes, start: S.selectedSlot, timezone: TZ, custom_answers,
    }});
    S.inviteeEmail = email;
    renderStep(4);
  } catch (e) {
    err.textContent = e.message;
    btn.disabled = false; btn.textContent = 'Confirmer le rendez-vous';
    // Si le créneau n'est plus dispo, revenir aux créneaux
    if (e.message.includes('n\'est plus disponible')) { S.slots = []; loadMonth(); }
  }
}

function showError(msg) {
  card.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);flex:1;">
    <div style="font-size:40px;margin-bottom:12px;">😕</div><h2>Impossible de charger cet événement</h2><p>${escapeHtml(msg)}</p>
    <a class="btn btn-secondary" href="/" style="margin-top:16px;">Accueil</a></div>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// petit helper pour $$ disponible dans ce contexte
function $$(s, r = document) { return Array.from(r.querySelectorAll(s)); }
