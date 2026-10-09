import fs from 'node:fs'
import path from 'node:path'

/**
 * Private avatar storage.
 *  - Supabase configured: private bucket `avatars` via Storage REST (service key stays on the server).
 *  - Otherwise: local ./data/avatars (dev fallback).
 * Files are only ever served through /api/avatars/:id after a consent/visibility check.
 */
const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = 'avatars'
export const useSupabase = !!(URL_ && KEY)
const headers = () => ({ Authorization: `Bearer ${KEY}`, apikey: KEY! })
const LOCAL = path.resolve(process.env.DATA_DIR ?? './data', 'avatars')

export async function initStorage() {
  if (!useSupabase) { fs.mkdirSync(LOCAL, { recursive: true }); return }
  const r = await fetch(`${URL_}/storage/v1/bucket`, {
    method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 2 * 1024 * 1024, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'] }),
  })
  if (!r.ok && r.status !== 409 && !(await r.text()).includes('already exists')) throw new Error(`Supabase bucket setup failed: ${r.status}`)
}

export async function putFile(name: string, buf: Buffer, mime: string) {
  if (!useSupabase) return void fs.writeFileSync(path.join(LOCAL, name), buf)
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${name}`, { method: 'POST', headers: { ...headers(), 'Content-Type': mime, 'x-upsert': 'true' }, body: new Uint8Array(buf) })
  if (!r.ok) throw new Error(`avatar upload failed: ${r.status}`)
}
export async function getFile(name: string): Promise<Buffer | null> {
  if (!useSupabase) { const f = path.join(LOCAL, path.basename(name)); return fs.existsSync(f) ? fs.readFileSync(f) : null }
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${name}`, { headers: headers() })
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null
}
export async function deleteFile(name: string) {
  if (!useSupabase) return void fs.rmSync(path.join(LOCAL, path.basename(name)), { force: true })
  await fetch(`${URL_}/storage/v1/object/${BUCKET}/${name}`, { method: 'DELETE', headers: headers() }).catch(() => {})
}
