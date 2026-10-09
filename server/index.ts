import express, { type NextFunction, type Request, type Response } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { ZodError } from 'zod'
import { all, initDb } from './db.ts'
import { initStorage } from './storage.ts'
import { ensureAdminFromEnv } from './auth.ts'
import { HttpError } from './util.ts'
import { pub } from './routes/public.ts'
import { my } from './routes/my.ts'
import { admin } from './routes/admin.ts'
import { seedIfEmpty } from './seed.ts'
import { sweep, getEvent, getApp, myLink } from './domain.ts'
import { sendMail } from './mail.ts'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '4mb' }))
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

app.use('/api/admin', admin)
app.use('/api/my', my)
app.use('/api', pub)
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found')))

const dist = path.resolve('dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api).*/, (req, res) => {
    // Personal and admin pages must not be indexed.
    if (/^\/(my|verify|admin)(\/|$)/.test(req.path)) res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code })
  if (err instanceof ZodError) return res.status(400).json({ error: 'validation', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
  console.error(err)
  res.status(500).json({ error: 'server_error' })
})

await initDb()
await initStorage()
await ensureAdminFromEnv()
await seedIfEmpty()

// 24-hour reminders for confirmed participants (sent once; stored as not_configured if no mail provider is set up).
setInterval(async () => {
  try {
    await sweep()
    const soon = await all<any>(
      `SELECT a.id FROM applications a JOIN events e ON e.id=a.event_id
        WHERE a.status='approved' AND a.reminder_sent=0 AND e.status='published' AND e.starts_at BETWEEN ? AND ?`,
      new Date(Date.now() + 23 * 3600_000).toISOString(), new Date(Date.now() + 25 * 3600_000).toISOString())
    for (const { id } of soon) {
      const a = (await getApp(id))!, e = (await getEvent(a.event_id))!
      const { run } = await import('./db.ts')
      await run('UPDATE applications SET reminder_sent=1 WHERE id=?', id)
      const { when } = await import('./domain.ts')
      await sendMail('reminder_24h', a.email, a.locale, { name: a.full_name, event: e.title, when: when(e, a.locale), meet: e.meeting_url ?? '', link2: myLink(a.manage_token) + '/table' }, a.id)
    }
  } catch (e) { console.error('[reminders]', e) }
}, 10 * 60_000).unref()

const port = Number(process.env.PORT ?? 8787)
app.listen(port, () => console.log(`THE NEXT TABLE API on http://localhost:${port}`))
