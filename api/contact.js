// Vercel serverless function: POST /api/contact
// FormSubmit blocks requests coming from Vercel servers, so the server no longer sends the e-mail itself.
// It validates, rate-limits and drops spam, then hands the browser the FormSubmit ID (never the e-mail address):
//  - with JS: returns {ok:true, to:ID}; the page posts to formsubmit.co/ajax/ID from the visitor's browser
//  - without JS: 307 redirect to formsubmit.co/ID (the browser re-posts the same form there)
//
// Env vars (Vercel → Settings → Environment Variables):
//   FORMSUBMIT_ID    FormSubmit target: the random ID given after activation (recommended) or the e-mail address
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

module.exports = async (req, res) => {
  const wantsJson = (req.headers.accept || '').includes('application/json');
  const reply = (code, body) => {
    if (wantsJson) return res.status(code).json(body);
    const m = /\/(ru|en)(\/|\?|#|$)/.exec(req.headers.referer || ''); const base = m ? '/' + m[1] : '/';
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

  const id = process.env.FORMSUBMIT_ID;
  if (!id) { console.error('[contact] missing env FORMSUBMIT_ID'); return reply(502, { ok: false, error: 'config' }); }
  if (wantsJson) return res.status(200).json({ ok: true, to: id, subject: 'Nouveau message – ' + f.typeLabel + ' – ' + f.name, type: f.typeLabel });
  res.statusCode = 307; res.setHeader('Location', 'https://formsubmit.co/' + encodeURIComponent(id)); return res.end();
};
