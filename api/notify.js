// Vercel serverless function: POST /api/notify → WhatsApp notification via CallMeBot.
// Runs on the server: the phone number and key are never sent to visitors.
// Optional env vars override the defaults: WHATSAPP_PHONE, WHATSAPP_APIKEY.
const PHONE = process.env.WHATSAPP_PHONE || '33643422078';
const APIKEY = process.env.WHATSAPP_APIKEY || '8696506';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : await new Promise((res) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => res(d)); });
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  const b = await readBody(req);
  if (b._honey) return res.status(200).json({ ok: true });
  if (!b.name || !b.email || !b.message) return res.status(400).json({ ok: false });

  const text = [
    '📩 Nouveau message — site',
    'Nom : ' + clip(b.name, 80),
    'E-mail : ' + clip(b.email, 120),
    'Projet : ' + clip(b.project_type, 60),
    b.location ? 'Lieu : ' + clip(b.location, 80) : null,
    '',
    clip(b.message, 400)
  ].filter((l) => l !== null).join('\n');

  const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(PHONE) + '&apikey=' + encodeURIComponent(APIKEY) + '&text=' + encodeURIComponent(text);
  try {
    const r = await fetch(url);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (e) {
    return res.status(502).json({ ok: false });
  }
};
