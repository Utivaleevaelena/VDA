import { Router } from 'express'
import { z } from 'zod'
import { all, get, run } from '../db.ts'
import { getFile } from '../storage.ts'
import { HttpError, rateLimit, wrap } from '../util.ts'
import { mailConfigured, sendMail, type Locale } from '../mail.ts'
import * as D from '../domain.ts'

export const pub = Router()

const loc = z.enum(['ru', 'en', 'pl'])
const str = (max: number) => z.string().trim().min(1).max(max)
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined)

const eventBySlug = async (slug: string) => {
  const e = await get<D.EventRow>(`SELECT * FROM events WHERE slug=? AND status IN ('published','registration_closed')`, slug)
  if (!e) throw new HttpError(404, 'event_not_found')
  return e
}

pub.get('/health', (_req, res) => { res.json({ ok: true }) })
pub.get('/config', (_req, res) => { res.json({ mailConfigured: mailConfigured() }) })

pub.get('/events', wrap(async (_req, res) => {
  await D.sweep()
  const rows = await all<D.EventRow>(`SELECT * FROM events WHERE status IN ('published','registration_closed') ORDER BY starts_at IS NULL, starts_at, id`)
  res.json(await Promise.all(rows.map((e) => D.publicEvent(e))))
}))

pub.get('/events/:slug', wrap(async (req, res) => {
  const e = (await eventBySlug(String(req.params.slug)))
  res.json({ event: await D.publicEvent(e), seats: await D.eventSeats(e), holdMinutes: D.HOLD_MINUTES })
}))

pub.post('/events/:slug/holds', rateLimit('hold', 30, 60_000), wrap(async (req, res) => {
  const body = z.object({ seat: z.number().int().min(1).max(18), previousToken: z.string().optional() }).parse(req.body)
  res.json(await D.createHold((await eventBySlug(String(req.params.slug))), body.seat, body.previousToken))
}))
pub.post('/events/:slug/holds/release', wrap(async (req, res) => {
  const body = z.object({ token: z.string() }).parse(req.body)
  await D.releaseHold((await eventBySlug(String(req.params.slug))).id, body.token)
  res.json({ ok: true })
}))

const applicationSchema = z.object({
  seat: z.number().int().min(1).max(18),
  holdToken: z.string().min(10),
  locale: loc,
  fullName: str(100),
  email: z.string().trim().toLowerCase().email().max(200),
  company: str(120),
  location: str(120),
  contact: opt(120),
  goal: opt(400),
  website: z.string().optional(), // honeypot: real users never fill this
  consent: z.object({ processing: z.literal(true), publicProfile: z.boolean(), marketing: z.boolean() }),
  profile: z.object({
    nickname: str(30), sector: str(60), city: opt(80), whatIBring: opt(160), avatar: z.string().max(3_000_000).optional(),
  }).optional(),
}).refine((v) => !v.consent.publicProfile || !!v.profile, { message: 'profile_required' })

pub.post('/events/:slug/applications', rateLimit('apply', 8, 10 * 60_000), wrap(async (req, res) => {
  const body = applicationSchema.parse(req.body)
  if (body.website) return res.json({ ok: true }) // silently drop bots
  const r = await D.createApplication((await eventBySlug(String(req.params.slug))), body as D.NewApplication)
  res.status(201).json({ status: 'pending_email', manageToken: r.manageToken })
}))

pub.post('/verify', rateLimit('verify', 20, 10 * 60_000), wrap(async (req, res) => {
  const { token } = z.object({ token: z.string().min(10) }).parse(req.body)
  res.json(await D.verifyEmail(token))
}))

pub.post('/events/:slug/waitlist', rateLimit('waitlist', 6, 10 * 60_000), wrap(async (req, res) => {
  const b = z.object({ name: str(100), email: z.string().trim().toLowerCase().email(), locale: loc, consent: z.literal(true) }).parse(req.body)
  const e = (await eventBySlug(String(req.params.slug)))
  try {
    await run('INSERT INTO waiting_list(event_id,name,email,locale) VALUES(?,?,?,?)', e.id, b.name, b.email, b.locale)
    await run('INSERT INTO consent_records(email,kind,granted,policy_version) VALUES(?,?,?,?)', b.email, 'processing', 1, D.POLICY_VERSION)
  } catch {
    throw new HttpError(409, 'already_waiting')
  }
  res.status(201).json({ ok: true })
}))

/** "I want to participate" for TBA events and the general newsletter. Never creates a booking. */
pub.post('/interest', rateLimit('interest', 6, 10 * 60_000), wrap(async (req, res) => {
  const b = z.object({
    email: z.string().trim().toLowerCase().email(), locale: loc, eventSlug: z.string().optional(),
    consent: z.literal(true), marketing: z.boolean().default(false), website: z.string().optional(),
  }).parse(req.body)
  if (b.website) return res.json({ ok: true })
  const e = b.eventSlug ? await eventBySlug(b.eventSlug) : undefined
  const eventId = e?.id ?? null
  const dup = await get('SELECT 1 FROM interests WHERE email=? AND event_id IS NOT DISTINCT FROM ?::bigint', b.email, eventId)
  if (!dup) {
    await run('INSERT INTO interests(event_id,email,locale,marketing_consent) VALUES(?,?,?,?)', eventId, b.email, b.locale, b.marketing ? 1 : 0)
    await run('INSERT INTO consent_records(email,kind,granted,policy_version) VALUES(?,?,?,?)', b.email, 'processing', 1, D.POLICY_VERSION)
    if (b.marketing) await run('INSERT INTO consent_records(email,kind,granted,policy_version) VALUES(?,?,?,?)', b.email, 'marketing', 1, D.POLICY_VERSION)
    await sendMail('interest_received', b.email, b.locale as Locale, {})
  }
  res.status(201).json({ ok: true })
}))

/** Avatars live in private storage and are served only when the owner's public profile is currently visible. */
export async function serveAvatar(profileId: number, includeHidden = false) {
  const p = await get<any>(
    `SELECT p.avatar_file, p.visible, p.hidden_by_admin, a.status FROM public_profiles p JOIN applications a ON a.id=p.application_id WHERE p.id=?`, profileId)
  if (!p?.avatar_file) return null
  if (!includeHidden && !(p.status === 'approved' && p.visible && !p.hidden_by_admin)) return null
  const data = await getFile(p.avatar_file)
  return data ? { data, mime: D.avatarMime(p.avatar_file) } : null
}
pub.get('/avatars/:id', wrap(async (req, res) => {
  const a = await serveAvatar(Number(req.params.id))
  if (!a) throw new HttpError(404, 'not_found')
  res.setHeader('Content-Type', a.mime)
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(a.data)
}))
