// Sondage de réunion : l'invité choisit le meilleur créneau parmi plusieurs.
const $ = (s, r = document) => r.querySelector(s);
function getUserTimezone(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(_){ return 'UTC'; } }
const TZ = getUserTimezone();
const card = $('#bk-card');
const pathParts = () => location.pathname.split('/').filter(Boolean);

async function api(url, opts={}) {
  const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts, body: opts.body?JSON.stringify(opts.body):undefined });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Une erreur est survenue');
  return data;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtSlot(iso){ try{return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:TZ}).format(new Date(iso));}catch(_){return new Date(iso).toLocaleString('fr-FR');} }

(async function init(){
  const p = pathParts(); // ['p', slug]
  try {
    const poll = await api(`/api/public/poll/${p[1]}`);
    document.documentElement.style.setProperty('--blue', poll.brand_color||'#0069ff');
    document.title = poll.title;
    render(poll);
  } catch(e){
    card.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);flex:1;">
      <div style="font-size:40px">📊</div><h2>Sondage introuvable</h2><p>${esc(e.message)}</p>
      <a class="btn btn-secondary" href="/" style="margin-top:16px;">Accueil</a></div>`;
  }
})();

let selectedSlot = null;

function render(poll){
  card.innerHTML = `
    <div class="bk-right" style="flex:1;padding:30px;">
      <div class="bk-host-avatar" style="background:${poll.brand_color||'#0069ff'};width:48px;height:48px;font-size:20px;margin-bottom:14px;">${poll.host_name.trim().slice(0,1).toUpperCase()}</div>
      <h1 style="font-size:22px;margin-bottom:4px;">${esc(poll.title)}</h1>
      <div class="bk-host">proposé par ${esc(poll.host_name)} · ${esc(poll.event_name)} · ${poll.duration} min</div>
      <p style="color:var(--muted);font-size:14px;margin:10px 0 18px;">Sélectionnez le créneau qui vous convient le mieux. <span style="font-size:12px;">(Horaires dans votre fuseau : ${TZ})</span></p>
      <div class="slots" style="flex-direction:column;">
        ${poll.slots.map(s=>`<button class="slot-btn poll-opt" data-id="${s.id}" data-start="${s.start_time}" style="justify-content:flex-start;text-align:left;width:100%;padding:14px 16px;">${fmtSlot(s.start_time)}</button>`).join('')}
      </div>
      <form class="bk-form" id="vote-form" style="margin-top:20px;">
        <label>Votre nom *</label><input type="text" id="v-name" required>
        <label>Votre email *</label><input type="email" id="v-email" required>
        <div class="error-msg" id="v-err"></div>
        <button class="btn btn-primary" type="submit" id="v-btn" style="width:100%;margin-top:14px;">Voter pour ce créneau</button>
      </form>
    </div>`;

  $$('.poll-opt').forEach(b=>b.addEventListener('click',()=>{
    selectedSlot = b.dataset.id;
    $$('.poll-opt').forEach(x=>x.classList.toggle('selected', x===b));
  }));

  $('#vote-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const err=$('#v-err'); err.textContent='';
    const name=$('#v-name').value.trim(), email=$('#v-email').value.trim();
    if(!selectedSlot){err.textContent='Sélectionnez d\'abord un créneau.';return;}
    if(!name||!email){err.textContent='Renseignez votre nom et email.';return;}
    const btn=$('#v-btn'); btn.disabled=true;
    try{
      const res = await api(`/api/public/poll/${pathParts()[1]}/vote`,{method:'POST',body:{slot_id:selectedSlot,name,email}});
      card.innerHTML = `<div class="bk-success" style="padding:40px;"><div class="check">✓</div>
        <h2>Vote enregistré !</h2>
        <p>Merci ${esc(name)} ! L'organisateur a bien reçu votre choix de créneau.<br>Vous serez notifié une fois la date confirmée.</p>
        <a class="btn btn-secondary" href="/" style="margin-top:12px;">Accueil</a></div>`;
    }catch(err2){ err.textContent=err2.message; btn.disabled=false; }
  });
}
