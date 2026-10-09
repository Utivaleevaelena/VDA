import { Router } from 'express'
import { z } from 'zod'
import { all, get, run, tx } from '../db.ts'
import { HttpError, rateLimit, slugify, wrap } from '../util.ts'
import { currentAdmin, endSession, requireAdmin, startSession, verifyPassword } from '../auth.ts'
import { mailConfigured, sendMail, ORGANIZER_EMAIL, PUBLIC_URL } from '../mail.ts'
import * as D from '../domain.ts'
import { serveAvatar } from './public.ts'

export const admin = Router()
admin.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next() })

admin.post('/login', rateLimit('login', 8, 10 * 60_000), wrap(async (req, res) => {
  const b = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body)
  const a = await get<any>('SELECT * FROM admins WHERE email=?', b.email)
  if (!a || !verifyPassword(b.password, a.password_hash)) throw new HttpError(401, 'bad_credentials')
  await startSession(res, a.id)
  res.json({ email: a.email })
}))
admin.get('/me', wrap(async (req, res) => {
  const a = await currentAdmin(req)
  if (!a) return res.status(401).json({ error: 'unauthorized' })
  res.json({ email: a.email, role: a.role })
}))
admin.post('/logout', wrap(async (req, res) => { await endSession(req, res); res.json({ ok: true }) }))

admin.use(requireAdmin)

/* ---- dashboard & settings ---- */
admin.get('/dashboard', wrap(async (_req, res) => {
  await D.sweep()
  const events = await all<D.EventRow>(`SELECT * FROM events ORDER BY starts_at IS NULL, starts_at, id`)
  const n = async (sql: string) => (await get<{ n: number }>(sql))!.n
  res.json({
    totals: {
      applications: await n(`SELECT COUNT(*) n FROM applications WHERE status IN ('pending_email','pending_approval','approved')`),
      pendingApproval: await n(`SELECT COUNT(*) n FROM applications WHERE status='pending_approval'`),
      confirmed: await n(`SELECT COUNT(*) n FROM applications WHERE status='approved'`),
      waiting: await n(`SELECT COUNT(*) n FROM waiting_list WHERE status='waiting'`),
      interests: await n(`SELECT COUNT(*) n FROM interests`),
      completedEvents: await n(`SELECT COUNT(*) n FROM events WHERE status='completed'`),
    },
    events: await Promise.all(events.map(async (e) => ({ ...(await D.publicEvent(e)), pending: await n(`SELECT COUNT(*) n FROM applications WHERE event_id=${Number(e.id)} AND status='pending_approval'`) }))),
  })
}))
admin.get('/settings', (_req, res) => {
  res.json({
    mail: { configured: mailConfigured(), provider: 'Resend', needs: mailConfigured() ? [] : ['RESEND_API_KEY', 'MAIL_FROM'] },
    organizerEmail: ORGANIZER_EMAIL, publicUrl: PUBLIC_URL,
    spamProtection: { rateLimit: true, honeypot: true, captcha: false },
  })
})
admin.get('/notifications', wrap(async (_req, res) => {
  res.json(await all(`SELECT id,type,to_email,locale,subject,body,status,error,application_id,created_at FROM notifications ORDER BY id DESC LIMIT 200`))
}))

/* ---- events ---- */
const eventSchema = z.object({
  title: z.string().trim().min(3).max(140),
  format: z.enum(['hot_seat', 'growth_lab', 'business_match', 'digital_clinic']),
  language: z.enum(['ru', 'en', 'pl']),
  topic: z.string().trim().max(30).default('growth'),
  description: z.string().trim().max(1200).default(''),
  benefits: z.array(z.string().trim().min(1).max(100)).max(3).default([]),
  host: z.string().trim().max(100).nullish().transform((v) => v || null),
  startsAt: z.string().datetime().nullish().transform((v) => v || null),
  durationMin: z.number().int().min(15).max(240).default(80),
  timezone: z.string().default('Europe/Warsaw'),
  capacity: z.number().int().min(6).max(18),
  meetingUrl: z.string().url().max(400).nullish().transform((v) => v || null),
})
const adminEvent = async (e: D.EventRow) => ({ ...(await D.publicEvent(e)), meetingUrl: e.meeting_url })

admin.get('/events', wrap(async (_req, res) => {
  res.json(await Promise.all((await all<D.EventRow>('SELECT * FROM events ORDER BY starts_at IS NULL, starts_at, id')).map(adminEvent)))
}))
admin.post('/events', wrap(async (req, res) => {
  const b = eventSchema.parse(req.body)
  try { Intl.DateTimeFormat('en', { timeZone: b.timezone }) } catch { throw new HttpError(400, 'bad_timezone') }
  const id = await tx(async () => {
    let slug = slugify(b.title), i = 1
    while (await get('SELECT 1 FROM events WHERE slug=?', slug)) slug = `${slugify(b.title)}-${++i}`
    const r = await run(
      `INSERT INTO events(slug,format,language,title,topic,description,benefits,host,starts_at,duration_min,timezone,capacity,meeting_url,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`,
      slug, b.format, b.language, b.title, b.topic, b.description, JSON.stringify(b.benefits), b.host, b.startsAt, b.durationMin, b.timezone, b.capacity, b.meetingUrl)
    await D.ensureSeats(Number(r.lastInsertRowid), b.capacity)
    return Number(r.lastInsertRowid)
  })
  res.status(201).json(await adminEvent((await D.getEvent(id))!))
}))
admin.patch('/events/:id', wrap(async (req, res) => {
  const e = await D.getEvent(Number(req.params.id)); if (!e) throw new HttpError(404, 'not_found')
  const b = eventSchema.parse(req.body)
  const occupied = (await get<{ m: number | null }>('SELECT MAX(seat_no) m FROM event_seats WHERE event_id=? AND application_id IS NOT NULL', e.id))!.m ?? 0
  if (b.capacity < occupied) throw new HttpError(409, 'capacity_below_occupied')
  await tx(async () => {
    await run(`UPDATE events SET format=?,language=?,title=?,topic=?,description=?,benefits=?,host=?,starts_at=?,duration_min=?,timezone=?,capacity=?,meeting_url=? WHERE id=?`,
      b.format, b.language, b.title, b.topic, b.description, JSON.stringify(b.benefits), b.host, b.startsAt, b.durationMin, b.timezone, b.capacity, b.meetingUrl, e.id)
    await D.ensureSeats(e.id, b.capacity)
  })
  const changed = [b.startsAt !== e.starts_at && 'date/time', b.language !== e.language && 'language', b.meetingUrl !== e.meeting_url && 'meeting link', b.title !== e.title && 'title'].filter(Boolean)
  if (changed.length) await notifyParticipants((await D.getEvent(e.id))!, `${changed.join(', ')} changed`)
  res.json(await adminEvent((await D.getEvent(e.id))!))
}))

async function notifyParticipants(e: D.EventRow, note: string) {
  const apps = await all<any>(`SELECT * FROM applications WHERE event_id=? AND status='approved'`, e.id)
  for (const a of apps)
    await sendMail('event_changed', a.email, a.locale, { name: a.full_name, event: e.title, note: `${note} — ${D.when(e, a.locale)}`, link: D.myLink(a.manage_token) }, a.id)
}

admin.post('/events/:id/status', wrap(async (req, res) => {
  const e = await D.getEvent(Number(req.params.id)); if (!e) throw new HttpError(404, 'not_found')
  const { status } = z.object({ status: z.enum(['draft', 'published', 'registration_closed', 'cancelled', 'completed']) }).parse(req.body)
  if (status === 'published' && !e.starts_at && !e.is_demo) { /* TBA pilots may be published: they accept interest only */ }
  await run('UPDATE events SET status=? WHERE id=?', status, e.id)
  const fresh = (await D.getEvent(e.id))!
  if (status === 'cancelled') {
    await notifyParticipants(fresh, 'the event was cancelled')
    for (const a of await all<any>(`SELECT id FROM applications WHERE event_id=? AND status IN ('pending_email','pending_approval')`, e.id)) await D.releaseApplication(a.id, 'cancelled', 'admin')
  }
  if (status === 'completed') {
    // Thank-you service e-mail to participants who attended (or, if attendance wasn't marked, to all confirmed).
    const marked = (await get<{ n: number }>('SELECT COUNT(*) n FROM attendance WHERE event_id=?', e.id))!.n
    const apps = await all<any>(
      marked
        ? `SELECT a.* FROM applications a JOIN attendance t ON t.application_id=a.id AND t.attended=1 WHERE a.event_id=? AND a.status='approved'`
        : `SELECT * FROM applications WHERE event_id=? AND status='approved'`, e.id)
    for (const a of apps) await sendMail('thank_you', a.email, a.locale, { name: a.full_name, event: e.title, link: D.myLink(a.manage_token) + '/next' }, a.id)
  }
  res.json(await adminEvent(fresh))
}))
admin.delete('/events/:id', wrap(async (req, res) => {
  const e = await D.getEvent(Number(req.params.id)); if (!e) throw new HttpError(404, 'not_found')
  if (e.status !== 'draft') throw new HttpError(409, 'only_drafts')
  const apps = (await get<{ n: number }>('SELECT COUNT(*) n FROM applications WHERE event_id=?', e.id))!.n
  if (apps) throw new HttpError(409, 'has_applications')
  await run('DELETE FROM events WHERE id=?', e.id)
  res.json({ ok: true })
}))

/* ---- applications ---- */
const appView = (a: any) => ({
  id: a.id, seat: a.seat_no, status: a.status, fullName: a.full_name, email: a.email, company: a.company, location: a.location,
  contact: a.contact, goal: a.goal, locale: a.locale, createdAt: a.created_at, emailVerifiedAt: a.email_verified_at,
  tokenRevoked: !!a.token_revoked, attended: a.attended === null || a.attended === undefined ? null : !!a.attended,
  consent: { publicProfile: !!a.profile_id && !!a.p_visible, marketing: !!a.marketing },
  profile: a.profile_id ? { id: a.profile_id, nickname: a.nickname, sector: a.sector, city: a.city, whatIBring: a.what_i_bring, visible: !!a.p_visible, hiddenByAdmin: !!a.hidden_by_admin, hasAvatar: !!a.avatar_file } : null,
})
const APP_SQL = `SELECT a.*, p.id profile_id, p.nickname, p.sector, p.city, p.what_i_bring, p.visible p_visible, p.hidden_by_admin, p.avatar_file, t.attended,
   (SELECT granted FROM consent_records c WHERE c.application_id=a.id AND c.kind='marketing' ORDER BY c.id DESC LIMIT 1) marketing
   FROM applications a LEFT JOIN public_profiles p ON p.application_id=a.id LEFT JOIN attendance t ON t.application_id=a.id AND t.event_id=a.event_id`

admin.get('/events/:id/applications', wrap(async (req, res) => {
  await D.sweep()
  res.json((await all(`${APP_SQL} WHERE a.event_id=? ORDER BY a.seat_no, a.id`, Number(req.params.id))).map(appView))
}))
admin.get('/events/:id/applications.csv', wrap(async (req, res) => {
  const rows = (await all(`${APP_SQL} WHERE a.event_id=? ORDER BY a.seat_no, a.id`, Number(req.params.id))).map(appView)
  const esc = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"` }
  const head = ['id', 'seat', 'status', 'name', 'email', 'company', 'location', 'contact', 'goal', 'language', 'created', 'public_profile', 'marketing', 'nickname', 'sector', 'what_i_bring', 'attended']
  const lines = rows.map((r) => [r.id, r.seat, r.status, r.fullName, r.email, r.company, r.location, r.contact, r.goal, r.locale, r.createdAt, r.consent.publicProfile, r.consent.marketing, r.profile?.nickname, r.profile?.sector, r.profile?.whatIBring, r.attended].map(esc).join(','))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="applications-${req.params.id}.csv"`)
  res.send('﻿' + [head.join(','), ...lines].join('\r\n'))
}))

const appAction = (fn: (a: NonNullable<Awaited<ReturnType<typeof D.getApp>>>, body: any) => unknown | Promise<unknown>) =>
  wrap(async (req, res) => {
    const a = await D.getApp(Number(req.params.id)); if (!a) throw new HttpError(404, 'not_found')
    await fn(a, req.body ?? {})
    res.json({ ok: true })
  })
admin.post('/applications/:id/approve', appAction((a) => D.approve(a.id)))
admin.post('/applications/:id/reject', appAction((a) => D.reject(a.id)))
admin.post('/applications/:id/release', appAction((a) => D.releaseByAdmin(a)))
admin.post('/applications/:id/reassign', appAction((a, b) => D.reassign(a.id, z.object({ seat: z.number().int().min(1).max(18) }).parse(b).seat)))
admin.post('/applications/:id/verify-email', appAction(async (a) => {
  // Manual fallback while transactional e-mail is not configured: the organiser vouches for the address.
  if (a.status !== 'pending_email') throw new HttpError(409, 'bad_status')
  await run(`UPDATE applications SET status='pending_approval', email_verified_at=? WHERE id=?`, new Date().toISOString(), a.id)
}))
admin.post('/applications/:id/hide-profile', appAction(async (a, b) => { await run('UPDATE public_profiles SET hidden_by_admin=? WHERE application_id=?', z.object({ hidden: z.boolean() }).parse(b).hidden ? 1 : 0, a.id) }))
admin.post('/applications/:id/revoke-link', appAction(async (a) => { await run('UPDATE applications SET token_revoked=1 WHERE id=?', a.id) }))
admin.post('/applications/:id/attendance', appAction(async (a, b) => {
  const { attended } = z.object({ attended: z.boolean() }).parse(b)
  await run('INSERT INTO attendance(event_id,application_id,attended) VALUES(?,?,?) ON CONFLICT(event_id,application_id) DO UPDATE SET attended=excluded.attended, marked_at=?', a.event_id, a.id, attended ? 1 : 0, new Date().toISOString())
}))
admin.get('/profiles/:id/avatar', wrap(async (req, res) => {
  const a = await serveAvatar(Number(req.params.id), true)
  if (!a) return res.status(404).end()
  res.setHeader('Content-Type', a.mime); res.send(a.data)
}))

/* ---- waiting list & interests ---- */
admin.get('/events/:id/waitlist', wrap(async (req, res) => {
  res.json(await all(`SELECT id,name,email,locale,status,offered_at,created_at FROM waiting_list WHERE event_id=? AND status<>'removed' ORDER BY id`, Number(req.params.id)))
}))
admin.post('/waitlist/:id/offer', wrap(async (req, res) => {
  const w = await get<any>('SELECT * FROM waiting_list WHERE id=?', Number(req.params.id)); if (!w) throw new HttpError(404, 'not_found')
  const e = (await D.getEvent(w.event_id))!
  if ((await D.publicEvent(e)).seatsFree < 1) throw new HttpError(409, 'no_free_seats')
  await run(`UPDATE waiting_list SET status='offered', offered_at=? WHERE id=?`, new Date().toISOString(), w.id)
  await sendMail('waitlist_offer', w.email, w.locale, { name: w.name, event: e.title, link: `${PUBLIC_URL}/events/${e.slug}` })
  res.json({ ok: true })
}))
admin.post('/waitlist/:id/remove', wrap(async (req, res) => { await run(`UPDATE waiting_list SET status='removed' WHERE id=?`, Number(req.params.id)); res.json({ ok: true }) }))
admin.get('/interests', wrap(async (_req, res) => {
  res.json(await all(`SELECT i.id,i.email,i.locale,i.marketing_consent,i.created_at,e.title event FROM interests i LEFT JOIN events e ON e.id=i.event_id ORDER BY i.id DESC LIMIT 500`))
}))
