(function () {
  var d = document, root = d.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = matchMedia('(max-width: 899px)');

  /* header: solid after hero, hide on scroll down (desktop only) */
  var header = d.getElementById('site-header'), hero = d.getElementById('accueil');
  var lastY = window.scrollY, ticking = false;
  function onScroll() {
    var y = window.scrollY, heroEnd = hero.offsetHeight - header.offsetHeight;
    header.classList.toggle('is-solid', y > heroEnd - 1);
    var hide = !mobile.matches && y > lastY && y > header.offsetHeight * 2 && !d.body.classList.contains('menu-open');
    if (y < lastY - 2 || mobile.matches) header.classList.remove('is-hidden');
    else if (hide) header.classList.add('is-hidden');
    lastY = y; ticking = false;
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
  onScroll();

  /* fullscreen mobile menu */
  var toggle = header.querySelector('.menu-toggle'), layer = d.getElementById('menu-layer');
  function openMenu() {
    layer.hidden = false; d.body.classList.add('menu-open'); toggle.setAttribute('aria-expanded', 'true');
    var first = layer.querySelector('ul a'); first && first.focus();
  }
  function closeMenu(restore) {
    if (layer.hidden) return;
    layer.hidden = true; d.body.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', 'false');
    if (restore) toggle.focus();
  }
  toggle.addEventListener('click', openMenu);
  layer.addEventListener('click', function (e) { var t = e.target.closest('[data-close]'); if (t) closeMenu(t.tagName === 'BUTTON'); });
  d.addEventListener('keydown', function (e) {
    if (layer.hidden) return;
    if (e.key === 'Escape') { closeMenu(true); return; }
    if (e.key === 'Tab') {
      var f = layer.querySelectorAll('a, button'), a = f[0], z = f[f.length - 1];
      if (e.shiftKey && d.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && d.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });
  mobile.addEventListener && mobile.addEventListener('change', function () { if (!mobile.matches) closeMenu(false); });

  /* accordions (system classes, single-open) */
  d.querySelectorAll('[data-acc]').forEach(function (list) {
    var items = Array.prototype.slice.call(list.children);
    function sync() { items.forEach(function (li) { var open = li.classList.contains('is-open'); var b = li.querySelector('button'); var p = li.querySelector('.vd-acc-body'); b.setAttribute('aria-expanded', open); p.setAttribute('aria-hidden', !open); }); }
    items.forEach(function (li) {
      li.querySelector('button').addEventListener('click', function () {
        var open = !li.classList.contains('is-open');
        items.forEach(function (o) { o.classList.remove('is-open'); });
        if (open) li.classList.add('is-open');
        sync();
      });
    });
    sync(); list.classList.add('is-in');
  });

  /* case details */
  d.querySelectorAll('.case-toggle').forEach(function (b) {
    var panel = d.getElementById(b.getAttribute('aria-controls'));
    panel.hidden = true;
    b.addEventListener('click', function () { var o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', o); panel.hidden = !o; });
  });

  /* reveal */
  var rev = d.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) rev.forEach(function (el) { el.classList.add('is-in'); });
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -10% 0px' });
    rev.forEach(function (el) { io.observe(el); });
  }

  /* form */
  var form = d.getElementById('contact-form'), status = d.getElementById('form-status'), btn = form.querySelector('button[type="submit"]');
  d.querySelectorAll('[data-prefill]').forEach(function (a) { a.addEventListener('click', function () { form.project_type.value = a.getAttribute('data-prefill'); setErr('project_type', ''); }); });
  var MSG = { req: 'Ce champ est requis.', email: 'Adresse e-mail invalide', ok: 'Merci, votre message a bien été envoyé. Nous vous répondrons prochainement.', err: 'L’envoi n’a pas abouti. Réessayez un peu plus tard ou écrivez via LinkedIn.', sending: 'Envoi…', send: 'Envoyer' };
  var REQ = ['name', 'email', 'project_type', 'message'];
  function setErr(n, m) { var el = form[n], out = d.getElementById('err-' + n); out.textContent = m; if (m) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
  function check(n) {
    var v = (form[n].value || '').trim();
    if (!v) return MSG.req;
    if (n === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return MSG.email;
    return '';
  }
  REQ.forEach(function (n) {
    form[n].addEventListener('input', function () { if (form[n].getAttribute('aria-invalid')) setErr(n, check(n)); });
    form[n].addEventListener('change', function () { if (form[n].getAttribute('aria-invalid')) setErr(n, check(n)); });
  });
  function focusField(el) {
    var r = el.getBoundingClientRect(), off = header.offsetHeight + 16;
    if (r.top < off || r.bottom > window.innerHeight) window.scrollTo({ top: r.top + window.scrollY - off, behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }
  function setStatus(m, cls) { status.textContent = m; status.className = 'form-status' + (cls ? ' ' + cls : ''); }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = null;
    REQ.forEach(function (n) { var m = check(n); setErr(n, m); if (m && !first) first = form[n]; });
    if (first) { setStatus('', ''); focusField(first); return; }
    var data = {}; ['name', 'email', 'project_type', 'location', 'message', '_honey'].forEach(function (n) { data[n] = (form[n].value || '').trim(); });
    btn.disabled = true; btn.textContent = MSG.sending; setStatus(MSG.sending, '');
    fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.ok !== true) throw new Error('send'); }); })
      .then(function () { form.reset(); setStatus(MSG.ok, 'is-ok'); })
      .catch(function () { setStatus(MSG.err, 'is-err'); })
      .then(function () { btn.disabled = false; btn.textContent = MSG.send; });
  });
})();
