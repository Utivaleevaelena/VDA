// Vercel serverless function: POST /api/contact
// One request from the browser → server sends to e-mail (FormSubmit) and WhatsApp (CallMeBot) in parallel.
// Nothing sensitive is shipped to the page.
//
// Env vars (Vercel → Settings → Environment Variables):
//   FORMSUBMIT_ID    FormSubmit target: the random ID given after activation (recommended) or the e-mail address
//   WHATSAPP_PHONE   e.g. 33643422078
//   WHATSAPP_APIKEY  CallMeBot key
//   SITE_URL         optional, default https://vda-six.vercel.app

const SITE_URL = process.env.SITE_URL || 'https://vda-six.vercel.app';
const TYPES = { healthcare: 'Établissement de santé', residential: 'Habitat ou rénovation', property: 'Potentiel immobilier', collaboration: 'Collaboration professionnelle' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMIT = 5, WINDOW_MS = 60 * 1000;
const hits = new Map(); // best-effort, per function instance

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return list.length > LIMIT;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : await new Promise((res) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => res(d)); });
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) { try { return JSON.parse(raw || '{}'); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

const one = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function sendEmail(f) {
  const id = process.env.FORMSUBMIT_ID;
  if (!id) { console.error('[contact] missing env FORMSUBMIT_ID'); throw new Error('missing env'); }
  const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE_URL, Referer: SITE_URL + '/' },
    body: JSON.stringify({
      name: f.name, email: f.email, project_type: f.typeLabel, location: f.location || '–', message: f.message,
      _subject: 'Nouveau message – ' + f.typeLabel + ' – ' + f.name,
      _replyto: f.email, _template: 'table', _captcha: 'false'
    })
  });
  const txt = await r.text();
  let j = {}; try { j = JSON.parse(txt); } catch {}
  if (r.status !== 200 || !(j.success === true || j.success === 'true')) {
    console.error('[contact] email failed', r.status, txt.slice(0, 500));
    throw new Error('email');
  }
}

async function sendWhatsApp(f) {
  const phone = process.env.WHATSAPP_PHONE, key = process.env.WHATSAPP_APIKEY;
  if (!phone) console.error('[contact] missing env WHATSAPP_PHONE');
  if (!key) console.error('[contact] missing env WHATSAPP_APIKEY');
  if (!phone || !key) throw new Error('missing env');
  const text = [
    '📩 Nouveau message – site',
    'Nom : ' + clip(one(f.name), 80),
    'E-mail : ' + f.email,
    'Projet : ' + f.typeLabel,
    f.location ? 'Lieu : ' + clip(one(f.location), 80) : null,
    '',
    clip(one(f.message), 400)
  ].filter((l) => l !== null).join('\n');
  const r = await fetch('https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(phone) + '&apikey=' + encodeURIComponent(key) + '&text=' + encodeURIComponent(text));
  const txt = await r.text();
  if (!r.ok || /error|invalid|not (been )?activ/i.test(txt)) {
    console.error('[contact] whatsapp failed', r.status, txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500));
    throw new Error('whatsapp');
  }
}

module.exports = async (req, res) => {
  const wantsJson = (req.headers.accept || '').includes('application/json');
  const reply = (code, body) => {
    if (wantsJson) return res.status(code).json(body);
    const base = /\/ru(\/|\?|#|$)/.test(req.headers.referer || '') ? '/ru' : '/';
    res.statusCode = 303; res.setHeader('Location', base + (body.ok ? '?envoye=1#form-envoye' : '?erreur=1#form-erreur')); return res.end();
  };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method' }); }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) { res.setHeader('Retry-After', '60'); return reply(429, { ok: false, error: 'rate' }); }

  const b = await readBody(req);
  if (b._honey) return reply(200, { ok: true });

  const f = {
    name: String(b.name || '').trim(),
    email: String(b.email || '').trim(),
    project_type: String(b.project_type || '').trim(),
    location: String(b.location || '').trim(),
    message: String(b.message || '').trim()
  };
  const errors = [];
  if (!f.name || f.name.length > 100) errors.push('name');
  if (!EMAIL_RE.test(f.email) || f.email.length > 254) errors.push('email');
  if (!TYPES[f.project_type]) errors.push('project_type');
  if (f.location.length > 200) errors.push('location');
  if (!f.message || f.message.length > 3000) errors.push('message');
  if (errors.length) return reply(400, { ok: false, error: 'validation', fields: errors });
  f.typeLabel = TYPES[f.project_type];

  // network errors / exceptions not already logged inside the senders
  const safe = (name, p) => p.catch((e) => { if (!/^(email|whatsapp|missing env)$/.test(e && e.message)) console.error('[contact] ' + name + ' failed', 0, e && e.message); throw e; });
  const [mail, wa] = await Promise.allSettled([safe('email', sendEmail(f)), safe('whatsapp', sendWhatsApp(f))]);

  const ok = mail.status === 'fulfilled' || wa.status === 'fulfilled';
  if (!ok) return reply(502, { ok: false, error: 'delivery' });
  if (mail.status !== 'fulfilled') console.error('[contact] partial: email not delivered, whatsapp ok');
  if (wa.status !== 'fulfilled') console.error('[contact] partial: whatsapp not delivered, email ok');
  return reply(200, { ok: true, email: mail.status === 'fulfilled', whatsapp: wa.status === 'fulfilled' });
};
