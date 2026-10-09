import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (Supabase Postgres connection string)')

// int8 (COUNT) → number
pg.types.setTypeParser(20, (v) => Number(v))

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  max: 10,
})

const txStore = new AsyncLocalStorage<pg.PoolClient>()
type Row = Record<string, any>

/** `?` placeholders → `$1, $2…` so SQL stays readable. */
const toPg = (sql: string) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`) }
const WITH_ID = /^\s*INSERT INTO (events|applications|public_profiles|waiting_list|interests|notifications|admins|consent_records)\b/i
const exec = (sql: string, params: any[]) => (txStore.getStore() ?? pool).query(toPg(sql), params)

export async function all<T = Row>(sql: string, ...p: any[]) { return (await exec(sql, p)).rows as T[] }
export async function get<T = Row>(sql: string, ...p: any[]) { return (await exec(sql, p)).rows[0] as T | undefined }
export async function run(sql: string, ...p: any[]) {
  const withId = WITH_ID.test(sql) && !/ON CONFLICT/i.test(sql)
  const r = await exec(withId ? `${sql} RETURNING id` : sql, p)
  return { changes: r.rowCount ?? 0, lastInsertRowid: r.rows[0]?.id as number | undefined }
}

/** Real Postgres transaction. Queries made through all/get/run inside fn automatically use it. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  const existing = txStore.getStore()
  if (existing) return fn()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await txStore.run(client, fn)
    await client.query('COMMIT')
    return r
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

const NOW = `to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

const TABLES = ['events', 'applications', 'event_seats', 'seat_holds', 'public_profiles', 'consent_records', 'waiting_list', 'interests', 'attendance', 'notifications', 'admins', 'admin_sessions']

export async function initDb() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  language TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'growth',
  description TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '[]',
  host TEXT,
  starts_at TEXT,
  duration_min INTEGER NOT NULL DEFAULT 80,
  timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  capacity INTEGER NOT NULL DEFAULT 8,
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS applications (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_no INTEGER NOT NULL,
  status TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  contact TEXT,
  goal TEXT,
  locale TEXT NOT NULL DEFAULT 'ru',
  verify_hash TEXT,
  manage_token TEXT NOT NULL UNIQUE,
  token_revoked INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  decided_at TEXT,
  cancelled_by TEXT,
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_app_email_active ON applications(event_id, lower(email))
  WHERE status IN ('pending_email','pending_approval','approved');
CREATE INDEX IF NOT EXISTS ix_app_verify ON applications(verify_hash);
CREATE TABLE IF NOT EXISTS event_seats (
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_no INTEGER NOT NULL,
  application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, seat_no)
);
CREATE TABLE IF NOT EXISTS seat_holds (
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_no INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (event_id, seat_no)
);
CREATE TABLE IF NOT EXISTS public_profiles (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  sector TEXT NOT NULL,
  city TEXT,
  what_i_bring TEXT,
  avatar_file TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  hidden_by_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS consent_records (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL,
  granted INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS waiting_list (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ru',
  status TEXT NOT NULL DEFAULT 'waiting',
  offered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (event_id, email)
);
CREATE TABLE IF NOT EXISTS interests (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ru',
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (email, event_id)
);
CREATE TABLE IF NOT EXISTS attendance (
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  attended INTEGER NOT NULL,
  marked_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (event_id, application_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  to_email TEXT NOT NULL,
  locale TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  application_id BIGINT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
`)
  // Supabase exposes tables through its Data API. RLS on + no policies = anon/authenticated keys can read nothing.
  // The server connects as the database owner, which is not affected by RLS.
  for (const t of TABLES) await pool.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`)
}
