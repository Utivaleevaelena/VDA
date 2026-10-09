import { all, get, run, tx } from './db.ts'
import { putFile, deleteFile } from './storage.ts'
import { HttpError, addMinutes, nowIso, sha256, token } from './util.ts'
import { sendMail, ORGANIZER_EMAIL, PUBLIC_URL, type Locale } from './mail.ts'

export const POLICY_VERSION = '2026-10-pilot'
export const HOLD_MINUTES = 10
export const EMAIL_VERIFY_MINUTES = 60
export const ACTIVE = ['pending_email', 'pending_approval', 'approved'] as const

export type EventRow = {
  id: number; slug: string; format: string; language: Locale; title: string; topic: string; description: string
  benefits: string; host: string | null; starts_at: string | null; duration_min: number; timezone: string
  capacity: number; meeting_url: string | null; status: string; is_demo: number
}
type AppRow = {
  id: number; event_id: number; seat_no: number; status: string; full_name: string; email: string; company: string
  location: string; contact: string | null; goal: string | null; locale: Locale; token_revoked: number
  email_verified_at: string | null; decided_at: string | null; created_at: string; is_demo: number; manage_token: string
}

/* ---------- housekeeping ---------- */

/** Frees expired holds and unverified applications. Called before every read/write that depends on seat state. */
export async function sweep() {
  const now = nowIso()
  await run('DELETE FROM seat_holds WHERE expires_at < ?', now)
  const stale = await all<{ id: number }>(
    `SELECT id FROM applications WHERE status='pending_email' AND created_at < ?`,
    new Date(Date.now() - EMAIL_VERIFY_MINUTES * 60_000).toISOString(),
  )
  for (const a of stale) await releaseApplication(a.id, 'expired', 'system')
}

export async function releaseApplication(appId: number, status: 'cancelled' | 'rejected' | 'expired', by: string) {
  await run('UPDATE event_seats SET application_id=NULL WHERE application_id=?', appId)
  await run('UPDATE applications SET status=?, cancelled_by=?, decided_at=COALESCE(decided_at,?) WHERE id=?', status, by, nowIso(), appId)
}

export async function ensureSeats(eventId: number, capacity: number) {
  for (let i = 1; i <= capacity; i++) await run('INSERT INTO event_seats(event_id,seat_no) VALUES(?,?) ON CONFLICT DO NOTHING', eventId, i)
  await run('DELETE FROM event_seats WHERE event_id=? AND seat_no>? AND application_id IS NULL', eventId, capacity)
}

/* ---------- public shapes ---------- */

export const registrationOpen = (e: EventRow) =>
  e.status === 'published' && !!e.starts_at && new Date(e.starts_at).getTime() > Date.now()

export async function publicEvent(e: EventRow) {
  const taken = (await get<{ n: number }>(
    `SELECT COUNT(*) n FROM event_seats WHERE event_id=? AND application_id IS NOT NULL`, e.id))!.n
  const held = (await get<{ n: number }>('SELECT COUNT(*) n FROM seat_holds WHERE event_id=?', e.id))!.n
  return {
    id: e.id, slug: e.slug, format: e.format, language: e.language, title: e.title, topic: e.topic,
    description: e.description, benefits: JSON.parse(e.benefits || '[]') as string[], host: e.host,
    startsAt: e.starts_at, durationMin: e.duration_min, timezone: e.timezone, capacity: e.capacity,
    status: e.status, isDemo: !!e.is_demo, registrationOpen: registrationOpen(e),
    seatsTaken: taken, seatsFree: Math.max(0, e.capacity - taken - held),
  }
}

export async function eventSeats(e: EventRow) {
  await sweep()
  const open = registrationOpen(e)
  const rows = await all<any>(
    `SELECT s.seat_no, a.status AS app_status, p.id AS profile_id, p.nickname, p.sector, p.avatar_file, p.visible, p.hidden_by_admin,
            (SELECT 1 FROM seat_holds h WHERE h.event_id=s.event_id AND h.seat_no=s.seat_no) AS held
       FROM event_seats s
       LEFT JOIN applications a ON a.id=s.application_id
       LEFT JOIN public_profiles p ON p.application_id=a.id
      WHERE s.event_id=? ORDER BY s.seat_no`, e.id)
  return rows.map((r) => {
    if (r.app_status === 'approved') {
      // Public data leaves the server only when the participant consented, the profile is switched on and not hidden by an organiser.
      if (r.profile_id && r.visible && !r.hidden_by_admin)
        return { seat: r.seat_no, state: 'confirmed_public', profile: { nickname: r.nickname, sector: r.sector, avatarUrl: r.avatar_file ? `/api/avatars/${r.profile_id}` : null } }
      return { seat: r.seat_no, state: 'confirmed_private' }
    }
    if (r.app_status) return { seat: r.seat_no, state: 'pending' }
    if (r.held) return { seat: r.seat_no, state: 'held' }
    return { seat: r.seat_no, state: open ? 'available' : 'closed' }
  })
}

/* ---------- holds ---------- */

export async function createHold(e: EventRow, seat: number, previousToken?: string) {
  if (!registrationOpen(e)) throw new HttpError(409, 'registration_closed')
  const t = token(24)
  return await tx(async () => {
    await sweep()
    if (previousToken) await run('DELETE FROM seat_holds WHERE event_id=? AND token_hash=?', e.id, sha256(previousToken))
    const s = await get<{ application_id: number | null }>('SELECT application_id FROM event_seats WHERE event_id=? AND seat_no=?', e.id, seat)
    if (!s) throw new HttpError(404, 'no_such_seat')
    if (s.application_id) throw new HttpError(409, 'seat_taken')
    const expires = addMinutes(HOLD_MINUTES)
    try {
      await run('INSERT INTO seat_holds(event_id,seat_no,token_hash,expires_at) VALUES(?,?,?,?)', e.id, seat, sha256(t), expires)
    } catch {
      throw new HttpError(409, 'seat_taken')
    }
    return { token: t, seat, expiresAt: expires }
  })
}
export const releaseHold = (eventId: number, t: string) => run('DELETE FROM seat_holds WHERE event_id=? AND token_hash=?', eventId, sha256(t))

/* ---------- avatars ---------- */

const MAGIC: [string, number[], string][] = [
  ['png', [0x89, 0x50, 0x4e, 0x47], 'image/png'],
  ['jpg', [0xff, 0xd8, 0xff], 'image/jpeg'],
  ['webp', [0x52, 0x49, 0x46, 0x46], 'image/webp'],
]
export const avatarMime = (file: string) => MAGIC.find(([ext]) => file.endsWith('.' + ext))?.[2] ?? 'application/octet-stream'

export async function saveAvatar(dataUrl: string): Promise<string> {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw new HttpError(400, 'bad_avatar')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 2 * 1024 * 1024) throw new HttpError(400, 'avatar_too_large')
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
  const magic = MAGIC.find(([e]) => e === ext)![1]
  if (!magic.every((b, i) => buf[i] === b)) throw new HttpError(400, 'bad_avatar')
  const name = `${token(16)}.${ext}`
  await putFile(name, buf, `image/${m[1]}`)
  return name
}
export const deleteAvatarFile = async (name?: string | null) => { if (name) await deleteFile(name) }

/* ---------- applications ---------- */

export type NewApplication = {
  seat: number; holdToken: string; locale: Locale; fullName: string; email: string; company: string; location: string
  contact?: string; goal?: string
  consent: { processing: true; publicProfile: boolean; marketing: boolean }
  profile?: { nickname: string; sector: string; city?: string; whatIBring?: string; avatar?: string }
}

export const when = (e: EventRow, locale: Locale) =>
  e.starts_at
    ? new Intl.DateTimeFormat({ ru: 'ru-RU', en: 'en-GB', pl: 'pl-PL' }[locale], { dateStyle: 'full', timeStyle: 'short', timeZone: e.timezone }).format(new Date(e.starts_at)) + ` (${e.timezone})`
    : '—'
export const myLink = (t: string) => `${PUBLIC_URL}/my/${t}`

export async function createApplication(e: EventRow, a: NewApplication) {
  if (!registrationOpen(e)) throw new HttpError(409, 'registration_closed')
  const verify = token(24), manage = token(24)
  let avatarFile: string | null = null
  if (a.consent.publicProfile && a.profile?.avatar) avatarFile = await saveAvatar(a.profile.avatar)
  let id: number
  try {
    id = await tx(async () => {
      await sweep()
      const h = await get<{ token_hash: string; expires_at: string }>('SELECT token_hash, expires_at FROM seat_holds WHERE event_id=? AND seat_no=?', e.id, a.seat)
      if (!h || h.token_hash !== sha256(a.holdToken) || h.expires_at < nowIso()) throw new HttpError(409, 'hold_expired')
      const seat = await get<{ application_id: number | null }>('SELECT application_id FROM event_seats WHERE event_id=? AND seat_no=?', e.id, a.seat)
      if (!seat || seat.application_id) throw new HttpError(409, 'seat_taken')
      let appId: number
      try {
        appId = Number((await run(
          `INSERT INTO applications(event_id,seat_no,status,full_name,email,company,location,contact,goal,locale,verify_hash,manage_token,is_demo)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)`,
          e.id, a.seat, 'pending_email', a.fullName, a.email.toLowerCase(), a.company, a.location, a.contact ?? null, a.goal ?? null, a.locale, sha256(verify), manage,
        )).lastInsertRowid)
      } catch {
        throw new HttpError(409, 'already_applied')
      }
      const claimed = await run('UPDATE event_seats SET application_id=? WHERE event_id=? AND seat_no=? AND application_id IS NULL', appId, e.id, a.seat)
      if (claimed.changes !== 1) throw new HttpError(409, 'seat_taken')
      await run('DELETE FROM seat_holds WHERE event_id=? AND seat_no=?', e.id, a.seat)
      if (a.consent.publicProfile && a.profile)
        await run('INSERT INTO public_profiles(application_id,nickname,sector,city,what_i_bring,avatar_file,visible) VALUES(?,?,?,?,?,?,1)',
          appId, a.profile.nickname, a.profile.sector, a.profile.city || null, a.profile.whatIBring || null, avatarFile)
      const cr = (kind: string, granted: boolean) =>
        run('INSERT INTO consent_records(application_id,email,kind,granted,policy_version) VALUES(?,?,?,?,?)', appId, a.email.toLowerCase(), kind, granted ? 1 : 0, POLICY_VERSION)
      await cr('processing', true); await cr('public_profile', a.consent.publicProfile); await cr('marketing', a.consent.marketing)
      return appId
    })
  } catch (err) {
    await deleteAvatarFile(avatarFile)
    throw err
  }
  await sendMail('email_confirm', a.email, a.locale, { name: a.fullName, event: e.title, seat: a.seat, link: `${PUBLIC_URL}/verify/${verify}` }, id)
  return { id, manageToken: manage }
}

export async function verifyEmail(t: string) {
  await sweep()
  const a = await get<AppRow>(`SELECT * FROM applications WHERE verify_hash=?`, sha256(t))
  if (!a) throw new HttpError(404, 'invalid_link')
  const e = (await get<EventRow>('SELECT * FROM events WHERE id=?', a.event_id))!
  if (a.status === 'expired' || a.status === 'cancelled') throw new HttpError(410, 'expired')
  if (a.status === 'pending_email') {
    await run(`UPDATE applications SET status='pending_approval', email_verified_at=? WHERE id=?`, nowIso(), a.id)
    await onEmailVerified(a, e)
  }
  return { status: 'pending_approval', eventTitle: e.title }
}
export async function onEmailVerified(a: AppRow, e: EventRow) {
  await sendMail('application_received', a.email, a.locale, { name: a.full_name, event: e.title, when: when(e, a.locale), seat: a.seat_no, link: myLink(a.manage_token) }, a.id)
  await sendMail('organizer_new_application', ORGANIZER_EMAIL, 'ru', { name: a.full_name, event: e.title, seat: a.seat_no, link: `${PUBLIC_URL}/admin` }, a.id)
}

/* ---------- organiser decisions & participant actions ---------- */

export const getApp = (id: number) => get<AppRow>('SELECT * FROM applications WHERE id=?', id)
export const getEvent = (id: number) => get<EventRow>('SELECT * FROM events WHERE id=?', id)

export async function approve(appId: number) {
  const a = await getApp(appId); if (!a) throw new HttpError(404, 'not_found')
  if (a.status !== 'pending_approval') throw new HttpError(409, 'bad_status')
  const e = (await getEvent(a.event_id))!
  await run(`UPDATE applications SET status='approved', decided_at=? WHERE id=?`, nowIso(), a.id)
  const meet = e.meeting_url || '(the organiser will add the link)'
  await sendMail('approved', a.email, a.locale, { name: a.full_name, event: e.title, when: when(e, a.locale), seat: a.seat_no, meet, link: myLink(a.manage_token), link2: myLink(a.manage_token) + '/table' }, a.id)
}
export async function reject(appId: number) {
  const a = await getApp(appId); if (!a) throw new HttpError(404, 'not_found')
  if (!['pending_approval', 'pending_email'].includes(a.status)) throw new HttpError(409, 'bad_status')
  const e = (await getEvent(a.event_id))!
  await releaseApplication(a.id, 'rejected', 'admin')
  await sendMail('rejected', a.email, a.locale, { name: a.full_name, event: e.title, link: PUBLIC_URL }, a.id)
}
export async function cancelByParticipant(a: AppRow) {
  if (!(ACTIVE as readonly string[]).includes(a.status)) throw new HttpError(409, 'bad_status')
  await releaseApplication(a.id, 'cancelled', 'participant')
}
export async function releaseByAdmin(a: AppRow) {
  if (!(ACTIVE as readonly string[]).includes(a.status)) throw new HttpError(409, 'bad_status')
  await releaseApplication(a.id, 'cancelled', 'admin')
}
export async function reassign(appId: number, newSeat: number) {
  await tx(async () => {
    await sweep()
    const a = await getApp(appId)
    if (!a || !(ACTIVE as readonly string[]).includes(a.status)) throw new HttpError(409, 'bad_status')
    const taken = await run('UPDATE event_seats SET application_id=? WHERE event_id=? AND seat_no=? AND application_id IS NULL AND NOT EXISTS (SELECT 1 FROM seat_holds h WHERE h.event_id=? AND h.seat_no=?)', a.id, a.event_id, newSeat, a.event_id, newSeat)
    if (taken.changes !== 1) throw new HttpError(409, 'seat_taken')
    await run('UPDATE event_seats SET application_id=NULL WHERE event_id=? AND seat_no=? AND application_id=?', a.event_id, a.seat_no, a.id)
    await run('UPDATE applications SET seat_no=? WHERE id=?', newSeat, a.id)
  })
}

/** GDPR-style erasure: scrub personal data, free the seat, delete avatar and profile. Consent records keep only the fact of consent. */
export async function eraseApplication(a: AppRow) {
  const prof = await get<{ avatar_file: string | null }>('SELECT avatar_file FROM public_profiles WHERE application_id=?', a.id)
  await deleteAvatarFile(prof?.avatar_file)
  await tx(async () => {
    await run('DELETE FROM public_profiles WHERE application_id=?', a.id)
    await run('UPDATE event_seats SET application_id=NULL WHERE application_id=?', a.id)
    await run(`UPDATE applications SET status='cancelled', cancelled_by='erased', full_name='[deleted]', email=?, company='', location='', contact=NULL, goal=NULL, verify_hash=NULL, token_revoked=1 WHERE id=?`, `deleted-${a.id}@invalid`, a.id)
    await run(`UPDATE consent_records SET email=? WHERE application_id=?`, `deleted-${a.id}@invalid`, a.id)
    await run(`UPDATE notifications SET to_email='[deleted]', body='[deleted]' WHERE application_id=?`, a.id)
  })
}

export async function ownProfile(appId: number) {
  const p = await get<any>('SELECT * FROM public_profiles WHERE application_id=?', appId)
  return p && { id: p.id, nickname: p.nickname, sector: p.sector, city: p.city, whatIBring: p.what_i_bring, hasAvatar: !!p.avatar_file, visible: !!p.visible, hiddenByAdmin: !!p.hidden_by_admin }
}

/** Members-only list for "Who's at your table": other approved participants who opted in. No contact data, ever. */
export async function tableMembers(eventId: number, exceptAppId: number) {
  const rows = await all<any>(
    `SELECT p.id, p.nickname, p.sector, p.city, p.what_i_bring, p.avatar_file, a.seat_no
       FROM applications a JOIN public_profiles p ON p.application_id=a.id
      WHERE a.event_id=? AND a.status='approved' AND a.id<>? AND p.visible=1 AND p.hidden_by_admin=0
      ORDER BY a.seat_no`, eventId, exceptAppId,
  )
  return rows.map((p) => ({ seat: p.seat_no, nickname: p.nickname, sector: p.sector, city: p.city, whatIBring: p.what_i_bring, avatarUrl: p.avatar_file ? `/api/avatars/${p.id}` : null }))
}

/** Simple rules from the spec: language → topic → soonest date → free seats → different format. Max three, published + dated only. */
export async function recommendations(from: EventRow) {
  const rows = await all<EventRow>(`SELECT * FROM events WHERE status='published' AND starts_at > ? AND id<>?`, nowIso(), from.id)
  const withPe = await Promise.all(rows.map(async (e) => ({ e, pe: await publicEvent(e) })))
  return withPe
    .filter((x) => x.pe.seatsFree > 0)
    .map((x) => ({ ...x, score: (x.e.language === from.language ? 40 : 0) + (x.e.topic === from.topic ? 20 : 0) + (x.e.format !== from.format ? 5 : 0) }))
    .sort((a, b) => b.score - a.score || a.e.starts_at!.localeCompare(b.e.starts_at!))
    .slice(0, 3)
    .map((x) => x.pe)
}
