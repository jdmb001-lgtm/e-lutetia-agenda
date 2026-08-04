// Charge le logo + nom du site depuis les réglages globaux et les applique.
(function () {
  fetch('/api/public/site-settings')
    .then((r) => r.json().catch(() => ({})))
    .then((s) => {
      if (s.logo) {
        document.querySelectorAll('[data-brand-logo]').forEach((el) => {
          el.innerHTML = `<img src="${s.logo}" alt="logo" style="height:30px;width:auto;vertical-align:middle;">`;
        });
      }
      if (s.site_name) {
        document.title = document.title.replace('E-Lutetia Agenda', s.site_name);
        document.querySelectorAll('[data-brand-name]').forEach((el) => { el.textContent = s.site_name; });
      }
      // Inscription : masquer le formulaire si désactivée
      if (s.registration_enabled === false) {
        const signupForm = document.getElementById('signup-form');
        if (signupForm) {
          signupForm.innerHTML = `<div class="empty" style="padding:30px;text-align:center;">
            <div class="e-ico">🔒</div>
            <h3>Les inscriptions sont actuellement fermées</h3>
            <p>L'administrateur doit créer votre compte. Contactez-le pour vous inscrire.</p>
          </div>`;
        }
      }
    })
    .catch(() => {});
})();
