// Lien à usage unique : l'invité voit le calendrier, réserve, le lien devient inutilisable.
const $ = (s, r = document) => r.querySelector(s);
function getUserTimezone(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(_){ return 'UTC'; } }
const TZ = getUserTimezone();
const S = { event:null, viewYear:null, viewMonth:null, overview:{}, selectedDate:null, slots:[], selectedSlot:null, step:1 };
const card = $('#bk-card');

async function api(url, opts={}) {
  const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts, body: opts.body?JSON.stringify(opts.body):undefined });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Une erreur est survenue');
  return data;
}
function pad(n){return String(n).padStart(2,'0');}
function isoDate(y,m,d){return `${y}-${pad(m)}-${pad(d)}`;}
function fmtSlot(iso){ try{return new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:TZ}).format(new Date(iso));}catch(_){return new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});} }
function fmtLong(iso){ try{return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:TZ}).format(new Date(iso));}catch(_){return new Date(iso).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});} }
function esc(s){return String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function $$(s,r=document){return Array.from(r.querySelectorAll(s));}
const DOW=['Lu','Ma','Me','Je','Ve','Sa','Di'];
const pathParts = () => location.pathname.split('/').filter(Boolean);

(async function init(){
  const p = pathParts(); // ['single', token]
  const token = p[1];
  try {
    const event = await api(`/api/public/single/${token}`);
    S.event = event;
    document.documentElement.style.setProperty('--blue', event.color||'#0069ff');
    document.title = event.name;
    const now = new Date(); S.viewYear=now.getFullYear(); S.viewMonth=now.getMonth()+1;
    renderShell();
    await loadMonth();
  } catch(e){
    card.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);flex:1;">
      <div style="font-size:40px">🔒</div><h2>Lien non valide ou déjà utilisé</h2>
      <p>${esc(e.message)}</p><a class="btn btn-secondary" href="/" style="margin-top:16px;">Accueil</a></div>`;
  }
})();

function renderShell(){
  const e=S.event;
  card.innerHTML = `
    <div class="bk-left">
      <div>
        <div class="bk-host-avatar" style="background:${e.color||'#0069ff'}">${e.host.name.trim().slice(0,1).toUpperCase()}</div>
        <h1>${esc(e.name)}</h1>
        <div class="bk-host">avec ${esc(e.host.name)}</div>
        ${e.description?`<div class="bk-desc">${esc(e.description)}</div>`:''}
        <div class="bk-meta">
          <div><span class="m-ico">⏱️</span> ${e.duration} min</div>
          <div><span class="m-ico">📍</span> ${esc({video:'Visio',in_person:'En personne',phone:'Téléphone',custom:'Lieu'}[e.location_type]||e.location_type)}${e.location_detail?' · '+esc(e.location_detail):''}</div>
          <div><span class="m-ico">🔒</span> Lien à usage unique</div>
        </div>
      </div>
      <div style="color:var(--muted);font-size:12px;">E-Lutetia Agenda</div>
    </div>
    <div class="bk-right" id="bk-right"></div>`;
}

async function loadMonth(){
  const p=pathParts();
  const res = await api(`/api/public/single/${p[1]}/month?year=${S.viewYear}&month=${S.viewMonth}`);
  S.overview=res; renderStep(1);
}

// Ajout route month pour single
function buildCalendar(){
  const y=S.viewYear,m=S.viewMonth;
  const offset=(new Date(y,m-1,1).getDay()+6)%7;
  const days=new Date(y,m,0).getDate();
  let cells=DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<offset;i++)cells+=`<div class="cal-day disabled"></div>`;
  for(let d=1;d<=days;d++){
    const key=isoDate(y,m,d); const info=S.overview[key]||{count:0};
    if(info.count>0){ cells+=`<div class="cal-day available ${key===S.selectedDate?'selected':''}" data-date="${key}">${d}<div class="slot-count">${info.count}</div></div>`; }
    else cells+=`<div class="cal-day disabled">${d}</div>`;
  }
  return cells;
}
function isMonthPast(){const n=new Date();return S.viewYear<n.getFullYear()||(S.viewYear===n.getFullYear()&&S.viewMonth<n.getMonth()+1);}

function renderStep(step){
  S.step=step; const right=$('#bk-right'); const e=S.event;
  const dots=`<div class="step-dots">${[1,2,3].map(i=>`<span class="dot ${i===step?'active':''}"></span>`).join('')}</div>`;
  if(step===1){
    const mt=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(S.viewYear,S.viewMonth-1,1));
    right.innerHTML=`${dots}<div class="bk-step"><h2>Sélectionnez une date</h2>
      <div class="cal-nav"><button id="prev-m" ${isMonthPast()?'disabled':''}>‹</button><div class="month-title" style="text-transform:capitalize;">${mt}</div><button id="next-m">›</button></div>
      <div class="cal-grid">${buildCalendar()}</div></div>`;
    $('#prev-m').addEventListener('click',()=>{S.viewMonth--;if(S.viewMonth<1){S.viewMonth=12;S.viewYear--;}loadMonth();});
    $('#next-m').addEventListener('click',()=>{S.viewMonth++;if(S.viewMonth>12){S.viewMonth=1;S.viewYear++;}loadMonth();});
    $$('.cal-day.available').forEach(c=>c.addEventListener('click',async()=>{
      S.selectedDate=c.dataset.date; renderStep(1);
      const p=pathParts(); const res=await api(`/api/public/single/${p[1]}/day?date=${S.selectedDate}`);
      S.slots=res.slots; if(S.selectedDate===c.dataset.date) renderStep(2);
    }));
  } else if(step===2){
    right.innerHTML=`${dots}<div class="bk-step">
      <h2 style="font-size:16px;color:var(--muted);margin-bottom:4px;">${fmtLong(S.selectedDate+'T12:00:00')}</h2>
      <h2>Sélectionnez une heure</h2>
      <div class="slots" style="margin-top:16px;">${S.slots.length?S.slots.map(s=>`<button class="slot-btn" data-start="${s.start}">${fmtSlot(s.start)}</button>`).join(''):'<p style="color:var(--muted)">Plus de créneau disponible.</p>'}</div></div>
      <div class="bk-footer"><button class="back" id="back1">← Revenir</button></div>`;
    $('#back1').addEventListener('click',()=>{S.selectedDate=null;S.slots=[];loadMonth();});
    $$('.slot-btn').forEach(b=>b.addEventListener('click',()=>{S.selectedSlot=b.dataset.start;$$('.slot-btn').forEach(x=>x.classList.toggle('selected',x===b));setTimeout(()=>renderStep(3),200);}));
  } else if(step===3){
    right.innerHTML=`${dots}<div class="bk-step">
      <div style="background:var(--bg-soft);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-weight:700;">${fmtSlot(S.selectedSlot)} · ${e.duration} min</div>
        <div style="color:var(--muted);font-size:14px;">${fmtLong(S.selectedSlot)}</div></div>
      <form class="bk-form" id="bk-form">
        <label>Votre nom *</label><input type="text" id="invitee-name" required>
        <label>Votre email *</label><input type="email" id="invitee-email" required>
        <label>Notes (facultatif)</label><textarea id="invitee-notes" rows="3"></textarea>
        <div class="tz-note">🌍 Horaires dans votre fuseau : ${TZ}</div>
        <div class="error-msg" id="bk-err"></div></form></div>
      <div class="bk-footer"><button class="back" id="back2">← Revenir</button><button class="btn btn-primary" id="confirm-btn">Confirmer</button></div>`;
    $('#back2').addEventListener('click',()=>renderStep(2));
    $('#confirm-btn').addEventListener('click',confirmBooking);
    $('#bk-form').addEventListener('submit',(e)=>{e.preventDefault();confirmBooking();});
  } else {
    right.innerHTML=`<div class="bk-success"><div class="check">✓</div><h2>C'est confirmé !</h2>
      <div class="bk-when">${fmtLong(S.selectedSlot)}</div><div style="font-size:16px;font-weight:600;">${fmtSlot(S.selectedSlot)} · ${e.duration} min</div>
      <p>${esc(e.host.name)} a bien reçu votre demande.<br>Un email de confirmation vous a été envoyé.</p></div>`;
  }
}

async function confirmBooking(){
  const name=$('#invitee-name').value.trim(), email=$('#invitee-email').value.trim(), notes=$('#invitee-notes').value.trim();
  const err=$('#bk-err'); err.textContent='';
  if(!name||!email){err.textContent='Veuillez renseigner votre nom et email.';return;}
  const btn=$('#confirm-btn'); btn.disabled=true; btn.textContent='Réservation…';
  const p=pathParts();
  try{
    await api(`/api/public/single/${p[1]}/book`,{method:'POST',body:{name,email,notes,start:S.selectedSlot,timezone:TZ}});
    renderStep(4);
  }catch(e){ err.textContent=e.message; btn.disabled=false; btn.textContent='Confirmer'; if(e.message.includes("n'est plus disponible")||e.message.includes('utilisé')){S.slots=[];loadMonth();} }
}
