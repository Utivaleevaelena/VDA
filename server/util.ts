import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

export const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const nowIso = () => new Date().toISOString()
export const addMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code)
  }
}

/** Fixed-window in-memory limiter. Good for a single-process pilot; use Redis/edge limits when scaling out. */
const buckets = new Map<string, { n: number; reset: number }>()
export function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${name}:${req.ip}`
    const now = Date.now()
    const b = buckets.get(key)
    if (!b || b.reset < now) buckets.set(key, { n: 1, reset: now + windowMs })
    else if (++b.n > max) return next(new HttpError(429, 'rate_limited'))
    next()
  }
}
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k)
}, 60_000).unref()

export const wrap =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next)

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'event'
