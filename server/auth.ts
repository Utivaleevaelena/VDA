import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { get, run } from './db.ts'
import { HttpError, nowIso, sha256, token } from './util.ts'

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}
export function verifyPassword(pw: string, stored: string) {
  const [, s, k] = stored.split('$')
  if (!s || !k) return false
  const key = crypto.scryptSync(pw, Buffer.from(s, 'base64'), 64)
  return crypto.timingSafeEqual(key, Buffer.from(k, 'base64'))
}

const COOKIE = 'nt_admin'
const TTL_H = 12

export async function startSession(res: Response, adminId: number) {
  const t = token()
  await run('INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)', sha256(t), adminId, new Date(Date.now() + TTL_H * 3600_000).toISOString())
  res.cookie(COOKIE, t, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: TTL_H * 3600_000, path: '/' })
}
export async function endSession(req: Request, res: Response) {
  const t = readCookie(req)
  if (t) await run('DELETE FROM admin_sessions WHERE token_hash=?', sha256(t))
  res.clearCookie(COOKIE, { path: '/' })
}
function readCookie(req: Request) {
  const m = /(?:^|;\s*)nt_admin=([^;]+)/.exec(req.headers.cookie ?? '')
  return m?.[1]
}
export async function currentAdmin(req: Request) {
  const t = readCookie(req)
  if (!t) return undefined
  return get<{ id: number; email: string; role: string }>(
    `SELECT a.id,a.email,a.role FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?`,
    sha256(t), nowIso(),
  )
}
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const a = await currentAdmin(req)
  if (!a) return next(new HttpError(401, 'unauthorized'))
  // CSRF: cookie is SameSite=Strict; additionally require JSON or a custom header for state changes.
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'nt') return next(new HttpError(403, 'csrf'))
  ;(req as any).admin = a
  next()
}

export async function ensureAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const pw = process.env.ADMIN_PASSWORD
  if (!email || !pw) return
  if (await get('SELECT 1 FROM admins LIMIT 1')) return
  await run('INSERT INTO admins(email,password_hash,role) VALUES(?,?,?)', email, hashPassword(pw), 'admin')
  console.log(`[admin] created admin ${email}`)
}
