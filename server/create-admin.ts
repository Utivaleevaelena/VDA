import { initDb } from './db.ts'
import { get, run } from './db.ts'
import { hashPassword } from './auth.ts'

await initDb()
const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
const pw = process.env.ADMIN_PASSWORD ?? ''
if (!email || pw.length < 10) {
  console.error('Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="at least 10 chars" npm run admin:create')
  process.exit(1)
}
if (await get('SELECT 1 FROM admins WHERE email=?', email)) await run('UPDATE admins SET password_hash=? WHERE email=?', hashPassword(pw), email)
else await run('INSERT INTO admins(email,password_hash,role) VALUES(?,?,?)', email, hashPassword(pw), 'admin')
console.log(`Admin ${email} saved.`)
process.exit(0)
