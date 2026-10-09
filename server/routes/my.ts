import { Router } from 'express'
import { z } from 'zod'
import { get, run } from '../db.ts'
import { HttpError, rateLimit, wrap } from '../util.ts'
import * as D from '../domain.ts'

export const my = Router()
my.use((_req, res, next) => {
  // Personal pages: never indexed, never cached.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('Cache-Control', 'no-store')
  next()
})
my.use(rateLimit('my', 120, 60_000))

type A = NonNullable<Awaited<ReturnType<typeof D.getApp>>>
const load = async (t: string | string[]): Promise<{ a: A; e: D.EventRow }> => {
  const a = await get<A>('SELECT * FROM applications WHERE manage_token=?', String(t))
  if (!a || a.token_revoked) throw new HttpError(404, 'invalid_link')
  await D.sweep()
  return { a: (await D.getApp(a.id))!, e: (await D.getEvent(a.event_id))! }
}

my.get('/:token', wrap(async (req, res) => {
  const { a, e } = await load(req.params.token)
  const approved = a.status === 'approved' && e.status !== 'cancelled'
  const marketing = await get<{ granted: number }>(`SELECT granted FROM consent_records WHERE application_id=? AND kind='marketing' ORDER BY id DESC LIMIT 1`, a.id)
  res.json({
    application: { status: a.status, seat: a.seat_no, fullName: a.full_name, email: a.email, locale: a.locale, marketing: !!marketing?.granted },
    event: await D.publicEvent(e),
    meetingUrl: approved ? e.meeting_url : null, // video link only for confirmed participants
    profile: await D.ownProfile(a.id),
    canViewTable: a.status === 'approved' && ['published', 'registration_closed', 'completed'].includes(e.status),
    completed: e.status === 'completed' && a.status === 'approved',
  })
}))

my.post('/:token/cancel', wrap(async (req, res) => {
  const { a } = await load(req.params.token)
  await D.cancelByParticipant(a)
  res.json({ ok: true })
}))

const profileSchema = z.object({
  visible: z.boolean(),
  nickname: z.string().trim().max(30).optional(), sector: z.string().trim().max(60).optional(),
  city: z.string().trim().max(80).optional(), whatIBring: z.string().trim().max(160).optional(),
  avatar: z.string().max(3_000_000).optional(), removeAvatar: z.boolean().optional(),
})
my.put('/:token/profile', wrap(async (req, res) => {
  const { a } = await load(req.params.token)
  if (!(D.ACTIVE as readonly string[]).includes(a.status)) throw new HttpError(409, 'bad_status')
  const b = profileSchema.parse(req.body)
  const cur = await get<any>('SELECT * FROM public_profiles WHERE application_id=?', a.id)
  if (!cur) {
    if (!b.visible) return res.json({ ok: true }) // nothing stored, nothing shown
    if (!b.nickname || !b.sector) throw new HttpError(400, 'profile_required')
    const file = b.avatar ? await D.saveAvatar(b.avatar) : null
    await run('INSERT INTO public_profiles(application_id,nickname,sector,city,what_i_bring,avatar_file,visible) VALUES(?,?,?,?,?,?,1)',
      a.id, b.nickname, b.sector, b.city || null, b.whatIBring || null, file)
    await run('INSERT INTO consent_records(application_id,email,kind,granted,policy_version) VALUES(?,?,?,?,?)', a.id, a.email, 'public_profile', 1, D.POLICY_VERSION)
    return res.json({ ok: true })
  }
  let file = cur.avatar_file as string | null
  if (b.removeAvatar || b.avatar) { await D.deleteAvatarFile(file); file = null }
  if (b.avatar) file = await D.saveAvatar(b.avatar)
  await run('UPDATE public_profiles SET nickname=?, sector=?, city=?, what_i_bring=?, avatar_file=?, visible=? WHERE application_id=?',
    b.nickname || cur.nickname, b.sector || cur.sector, b.city || null, b.whatIBring || null, file, b.visible ? 1 : 0, a.id)
  if (!!cur.visible !== b.visible)
    await run('INSERT INTO consent_records(application_id,email,kind,granted,policy_version) VALUES(?,?,?,?,?)', a.id, a.email, 'public_profile', b.visible ? 1 : 0, D.POLICY_VERSION)
  res.json({ ok: true })
}))

my.delete('/:token/profile', wrap(async (req, res) => {
  const { a } = await load(req.params.token)
  const p = await get<any>('SELECT avatar_file FROM public_profiles WHERE application_id=?', a.id)
  await D.deleteAvatarFile(p?.avatar_file)
  await run('DELETE FROM public_profiles WHERE application_id=?', a.id)
  await run('INSERT INTO consent_records(application_id,email,kind,granted,policy_version) VALUES(?,?,?,?,?)', a.id, a.email, 'public_profile', 0, D.POLICY_VERSION)
  res.json({ ok: true }) // the seat stays occupied
}))

my.put('/:token/marketing', wrap(async (req, res) => {
  const { a } = await load(req.params.token)
  const { granted } = z.object({ granted: z.boolean() }).parse(req.body)
  await run('INSERT INTO consent_records(application_id,email,kind,granted,policy_version) VALUES(?,?,?,?,?)', a.id, a.email, 'marketing', granted ? 1 : 0, D.POLICY_VERSION)
  res.json({ ok: true })
}))

my.post('/:token/erase', wrap(async (req, res) => {
  const { a } = await load(req.params.token)
  await D.eraseApplication(a)
  res.json({ ok: true })
}))

my.get('/:token/table', wrap(async (req, res) => {
  const { a, e } = await load(req.params.token)
  if (a.status !== 'approved') throw new HttpError(403, 'not_confirmed')
  res.json({ event: await D.publicEvent(e), seat: a.seat_no, seats: await D.eventSeats(e), members: await D.tableMembers(e.id, a.id) })
}))

my.get('/:token/next-seat', wrap(async (req, res) => {
  const { a, e } = await load(req.params.token)
  if (a.status !== 'approved' || e.status !== 'completed') throw new HttpError(403, 'not_completed')
  res.json({ recommendations: await D.recommendations(e) })
}))
